// ─────────────────────────────────────────────────────────────
// Admin: overview counts, programmes, users, modules, tutor
// approvals, at-risk reports and the low-attendance alert job.
// Every change is written to the audit log.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { env } = require('../config/env');
const { DAY_MS } = require('../config/constants');
const { roleIn, userOut, monthStart, round1 } = require('../utils/format');
const { BadRequest, NotFound, Conflict } = require('../utils/errors');
const { loadMatrix, overallFor } = require('./stats.service');
const { writeAuditLog } = require('./audit.service');
const { notify } = require('./notifications.service');

// ── Overview ──────────────────────────────────────────────────
async function overview() {
  const [students, newStudents, tutors, pendingTutors, programs, modules] = await Promise.all([
    prisma.user.count({ where: { role: 'student' } }),
    prisma.user.count({ where: { role: 'student', createdAt: { gte: monthStart() } } }),
    prisma.user.count({ where: { role: 'tutor', isActive: true } }),
    prisma.user.count({ where: { role: 'tutor', isActive: false, status: 'active', passwordHash: { not: null } } }),
    prisma.program.count(),
    prisma.module.count(),
  ]);
  return { students, newStudents, tutors, pendingTutors, programs, modules };
}

// ── Programmes ────────────────────────────────────────────────
const listPrograms = async () => (await prisma.program.findMany({ orderBy: { name: 'asc' } })).map((p) => p.name);

async function createProgram(adminId, name) {
  if (await prisma.program.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } })) throw Conflict('That programme already exists');
  const p = await prisma.program.create({ data: { name } });
  await writeAuditLog(adminId, 'Created program', name);
  return p;
}

/** Renames the programme AND every user's department text that used the old name. */
async function renameProgram(adminId, from, to) {
  const r = await prisma.$transaction([
    prisma.program.updateMany({ where: { name: from }, data: { name: to } }),
    prisma.user.updateMany({ where: { department: from }, data: { department: to } }),
  ]);
  if (!r[0].count) throw NotFound('Programme not found');
  await writeAuditLog(adminId, 'Renamed program', `${from} -> ${to}`);
  return { message: 'Renamed' };
}

// ── Users ─────────────────────────────────────────────────────
async function listUsers({ role, department, year }) {
  const where = { role: roleIn(role), ...(department && { department }) };
  if (year) where.OR = year === 1 ? [{ year: 1 }, { year: null }] : [{ year }]; // older accounts have no year → treat as year 1
  const users = await prisma.user.findMany({ where, orderBy: { name: 'asc' } });
  if (role !== 'student') return users.map(userOut);
  const pct = await overallFor(users.map((u) => u.id));
  return users.map((u) => ({ ...userOut(u), pct: pct.get(u.id) }));
}

async function patchUser(adminId, id, { active, name }) {
  if (id === adminId && active === false) throw BadRequest('You cannot deactivate your own account');
  const data = {};
  if (active !== undefined) { data.isActive = active; data.status = active ? 'active' : 'inactive'; }
  if (name) data.name = name;
  const u = await prisma.user.update({ where: { id }, data });
  await writeAuditLog(adminId, active === undefined ? 'Edited user' : active ? 'Activated user' : 'Deactivated user', `${u.name} (${u.id})`);
  return userOut(u);
}

// ── Modules ───────────────────────────────────────────────────
async function listModules({ department, year, semester }) {
  const rows = await prisma.module.findMany({
    where: { ...(department && { program: { name: department } }), ...(year && { year }), ...(semester && { semester }) },
    include: { sections: { include: { tutor: true }, take: 1 }, _count: { select: { enrollments: true } } }, orderBy: { code: 'asc' },
  });
  return rows.map((m) => ({
    _id: m.id, name: m.name, code: m.code, year: m.year, semester: m.semester, count: m.moduleCount, students: m._count.enrollments,
    tutor: m.sections[0] ? { userId: m.sections[0].tutor.id, name: m.sections[0].tutor.name } : null,
  }));
}

/** Create (id = null) or update a module; creates the programme if new; assigns the tutor via section A. */
async function saveModule(adminId, id, b) {
  const program = (await prisma.program.findFirst({ where: { name: b.department } })) || (await prisma.program.create({ data: { name: b.department } }));
  const data = { name: b.name, code: b.code, programId: program.id, year: b.year ?? null, semester: b.semester ?? null, moduleCount: b.count ?? null };

  let tutor = null;
  if (b.tutorId) {
    tutor = await prisma.user.findFirst({ where: { id: { in: [b.tutorId, b.tutorId.toUpperCase()] }, role: 'tutor' } });
    if (!tutor) throw NotFound('Tutor not found', 'TUTOR_NOT_FOUND');
  }
  const m = await prisma.$transaction(async (tx) => {
    const mod = id ? await tx.module.update({ where: { id }, data }) : await tx.module.create({ data });
    if (tutor) {
      const sec = await tx.section.findFirst({ where: { moduleId: mod.id } });
      if (sec) await tx.section.update({ where: { id: sec.id }, data: { tutorId: tutor.id } });
      else await tx.section.create({ data: { moduleId: mod.id, tutorId: tutor.id, name: 'A' } });
    }
    return mod;
  });
  await writeAuditLog(adminId, id ? 'Updated module' : 'Created module', `${m.code}${tutor ? ` (tutor ${tutor.name})` : ''}`);
  if (tutor) await notify(tutor.id, `You were assigned to teach ${m.code} – ${m.name}.`, 'System');
  return { _id: m.id };
}

// ── Tutor approvals ───────────────────────────────────────────
// Pending tutor = signed up (has a password), not active, not rejected.
const pendingWhere = { role: 'tutor', isActive: false, status: 'active', passwordHash: { not: null } };

const pendingTutors = async () => (await prisma.user.findMany({ where: pendingWhere, orderBy: { createdAt: 'asc' } })).map(userOut);

async function approveTutor(adminId, id) {
  const u = await prisma.user.findFirst({ where: { id, ...pendingWhere } });
  if (!u) throw NotFound('Pending tutor request not found');
  await prisma.user.update({ where: { id }, data: { isActive: true, status: 'active' } });
  await notify(u.id, 'Your tutor account has been approved. You can now log in.', 'System', { email: 'Your CheckIn tutor account is approved' });
  await writeAuditLog(adminId, 'Tutor Approved', `${u.name} (${u.id})`);
  return { userId: u.id, status: 'active' };
}

async function rejectTutor(adminId, id) {
  const u = await prisma.user.findFirst({ where: { id, ...pendingWhere } });
  if (!u) throw NotFound('Only pending tutor requests can be rejected');
  await prisma.user.update({ where: { id }, data: { status: 'inactive' } });
  await writeAuditLog(adminId, 'Tutor Rejected', `${u.name} (${u.id})`);
  return { userId: u.id, status: 'inactive' };
}

// ── Reports ───────────────────────────────────────────────────
/** Student × module pairs below the threshold, worst first. Per module, so a weak module isn't hidden by a good average. */
async function atRisk({ below = env.atRiskPct, department }) {
  const en = await prisma.enrollment.findMany({
    where: { student: { role: 'student', ...(department && { department }) } }, include: { student: true, module: true },
  });
  const m = await loadMatrix([...new Set(en.map((e) => e.moduleId))]);
  const rows = [];
  for (const e of en) {
    const p = m.pct(e.studentId, e.moduleId);
    if (p != null && p < below) {
      rows.push({
        userId: e.student.id, name: e.student.name, department: e.student.department,
        module: { id: e.moduleId, code: e.module.code, name: e.module.name }, pct: p, sessions: m.sessionsOf(e.moduleId).length,
      });
    }
  }
  return { threshold: below, rows: rows.sort((a, b) => a.pct - b.pct) };
}

/** Every student in a programme (department) with their overall %. */
async function programmeReport(name) {
  const studs = await prisma.user.findMany({ where: { role: 'student', department: name }, orderBy: { id: 'asc' } });
  const pct = await overallFor(studs.map((u) => u.id));
  const rows = studs.map((u) => {
    const p = pct.get(u.id);
    return { userId: u.id, name: u.name, programme: u.programme, year: u.year, pct: p, status: p < env.atRiskPct ? 'At risk' : 'OK' };
  });
  const avg = rows.length ? round1(rows.reduce((a, r) => a + r.pct, 0) / rows.length) : 0;
  return { programme: name, students: rows.length, average: avg, atRisk: rows.filter((r) => r.status === 'At risk').length, threshold: env.atRiskPct, rows };
}

/**
 * Alert job: every active student under REQUIRED % in a module gets a
 * notification (+ email if set up). Skips anyone already alerted about
 * that module in the last LOW_ATTENDANCE_REALERT_DAYS days, so it is safe
 * to run as often as you like (button, or a weekly cron).
 */
async function runLowAttendanceJob(adminId) {
  const cutoff = new Date(Date.now() - env.realertDays * DAY_MS), res = { scanned: 0, alerts: 0, skipped: 0 };
  const en = await prisma.enrollment.findMany({ where: { student: { role: 'student', isActive: true } }, include: { module: true } });
  const m = await loadMatrix([...new Set(en.map((e) => e.moduleId))]);
  for (const e of en) {
    const p = m.pct(e.studentId, e.moduleId);
    if (p == null) continue;
    res.scanned++;
    if (p >= env.requiredPct) continue;
    const recent = await prisma.notification.findFirst({ where: { userId: e.studentId, category: 'Attendance', createdAt: { gte: cutoff }, message: { contains: `in ${e.module.code} is` } } });
    if (recent) { res.skipped++; continue; }
    await notify(e.studentId, `Your attendance in ${e.module.code} is ${p}% - below the ${env.requiredPct}% requirement. Please speak to your tutor.`,
      'Attendance', { email: `Low attendance in ${e.module.code}` });
    res.alerts++;
  }
  if (adminId) await writeAuditLog(adminId, 'Low-attendance job', `${res.alerts} alerts sent, ${res.skipped} skipped`);
  return res;
}

module.exports = {
  overview, listPrograms, createProgram, renameProgram, listUsers, patchUser, listModules, saveModule,
  pendingTutors, approveTutor, rejectTutor, atRisk, programmeReport, runLowAttendanceJob,
};
