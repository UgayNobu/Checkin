// ─────────────────────────────────────────────────────────────
// Admin: overview counts, programmes, users, modules, tutor
// approvals, at-risk reports and the low-attendance alert job.
// Every change is written to the audit log.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { env } = require('../config/env');
const { DAY_MS } = require('../config/constants');
const { roleIn, roleOut, userOut, monthStart, round1 } = require('../utils/format');
const { BadRequest, NotFound, Conflict } = require('../utils/errors');
const { loadMatrix, overallFor } = require('./stats.service');
const { writeAuditLog } = require('./audit.service');
const { notify } = require('./notifications.service');
const { currentAcademicSession } = require('../lib/academicSession');

// ── Overview ──────────────────────────────────────────────────
async function overview() {
  const [students, newStudents, tutors, pendingTutors, programs, modules, inactiveStudents, inactiveTutors] = await Promise.all([
    prisma.user.count({ where: { role: 'student', isActive: true } }), // current students only
    prisma.user.count({ where: { role: 'student', createdAt: { gte: monthStart() } } }),
    prisma.user.count({ where: { role: 'tutor', isActive: true } }),
    prisma.user.count({ where: { role: 'tutor', isActive: false, status: 'active', passwordHash: { not: null } } }),
    prisma.program.count(),
    prisma.module.count(),
    prisma.user.count({ where: { role: 'student', isActive: false } }),
    prisma.user.count({ where: { role: 'tutor', status: 'inactive' } }),
  ]);
  return { students, newStudents, tutors, pendingTutors, programs, modules, inactiveStudents, inactiveTutors };
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
async function listUsers({ role, department, programme, year }) {
  const where = { role: roleIn(role), AND: [] };
  if (department) where.AND.push({ department });
  if (programme) where.AND.push({ OR: [{ programme }, { department: programme }] });
  if (year) where.AND.push({ OR: year === 1 ? [{ year: 1 }, { year: null }] : [{ year }] }); // older accounts have no year → treat as year 1
  const users = await prisma.user.findMany({ where, orderBy: { name: 'asc' } });
  if (role !== 'student') return users.map(userOut);
  const pct = await overallFor(users.map((u) => u.id));
  return users.map((u) => ({ ...userOut(u), pct: pct.get(u.id) }));
}

// Reasons an admin can give when deactivating, per role. Accounts are never deleted.
const REASONS = {
  student: ['graduated', 'dropped_out', 'transferred', 'on_leave', 'other'],
  tutor: ['resigned', 'retired', 'transferred', 'on_leave', 'other'],
  management: ['resigned', 'retired', 'transferred', 'on_leave', 'other'],
  admin: ['resigned', 'retired', 'transferred', 'on_leave', 'other'],
};
const REASON_TEXT = {
  graduated: 'Graduated', dropped_out: 'Dropped out', transferred: 'Transferred', on_leave: 'On leave / break',
  resigned: 'Resigned', retired: 'Retired', other: 'Other',
};

/**
 * Rename, deactivate or activate an account. Nothing is deleted: a deactivated user can't
 * log in (any open session stops working at once) and is left out of new classes, but all
 * their attendance, enrolments and evidence stay, and the admin can activate them again.
 */
async function patchUser(adminId, id, { active, name, reason, note }) {
  const u0 = await prisma.user.findUnique({ where: { id } });
  if (!u0) throw NotFound('User not found');
  const data = {};
  if (name) data.name = name;

  if (active === false) {
    if (id === adminId) throw BadRequest('You cannot deactivate your own account', 'SELF_DEACTIVATE');
    if (!(REASONS[u0.role] || REASONS.tutor).includes(reason)) {
      throw BadRequest(`"${REASON_TEXT[reason] || reason}" is not a reason for a ${roleOut(u0.role)}`, 'BAD_REASON');
    }
    if (u0.role === 'admin' && (await prisma.user.count({ where: { role: 'admin', isActive: true } })) <= 1) {
      throw BadRequest('This is the only active admin account, so it cannot be deactivated', 'LAST_ADMIN');
    }
    Object.assign(data, {
      isActive: false, status: 'inactive', deactivatedAt: new Date(), deactivatedBy: adminId,
      deactivationReason: reason, deactivationNote: note || null,
    });
  } else if (active === true) {
    // Also approves a tutor who was waiting for approval
    Object.assign(data, { isActive: true, status: 'active', deactivatedAt: null, deactivatedBy: null, deactivationReason: null, deactivationNote: null });
  }

  const u = await prisma.user.update({ where: { id }, data });
  const label = active === undefined ? 'Edited user' : active ? 'Activated user' : 'Deactivated user';
  await writeAuditLog(adminId, label, `${u.name} (${u.id})${active === false ? ` – ${REASON_TEXT[reason]}${note ? `: ${note}` : ''}` : ''}`);

  const out = userOut(u);
  // A tutor who leaves still holds this semester's modules: tell the admin which ones to reassign
  if (active === false && u.role === 'tutor') {
    const secs = await prisma.section.findMany({
      where: { tutorId: u.id, academicSession: await currentAcademicSession() },
      include: { module: { select: { id: true, code: true, name: true } } },
    });
    out.modulesToReassign = secs.map((x) => x.module);
  }
  return out;
}

// ── Modules ───────────────────────────────────────────────────
/** Filters through program_modules, so a module shared by several programmes shows under each of them. */
async function listModules({ department, year, semester }) {
  const cur = { ...(department && { program: { name: department } }), ...(year && { year }), ...(semester && { semester }) };
  const academicSession = await currentAcademicSession(); // tutor and class size for this semester
  const rows = await prisma.module.findMany({
    where: Object.keys(cur).length ? { curriculum: { some: cur } } : {},
    include: {
      sections: { where: { academicSession }, include: { tutor: true }, take: 1 },
      _count: { select: { enrollments: { where: { academicSession, student: { isActive: true } } } } },
    },
    orderBy: { code: 'asc' },
  });
  return rows.map((m) => ({
    _id: m.id, name: m.name, code: m.code, year: m.year, semester: m.semester, count: m.moduleCount, students: m._count.enrollments,
    // active: false → the tutor has left; the admin should assign someone else
    tutor: m.sections[0] ? { userId: m.sections[0].tutor.id, name: m.sections[0].tutor.name, active: m.sections[0].tutor.isActive } : null,
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
    // On update the module keeps its original programme; the programme link lives in program_modules.
    const mod = id ? await tx.module.update({ where: { id }, data: { ...data, programId: undefined } }) : await tx.module.create({ data });
    if (data.year && data.semester) {
      await tx.programModule.upsert({
        where: { programId_moduleId: { programId: program.id, moduleId: mod.id } },
        update: { year: data.year, semester: data.semester },
        create: { programId: program.id, moduleId: mod.id, year: data.year, semester: data.semester },
      });
    }
    if (tutor) {
      // Only this semester's assignment changes; past semesters keep the tutor who taught them.
      const academicSession = await currentAcademicSession();
      const sec = await tx.section.findFirst({ where: { moduleId: mod.id, academicSession } });
      if (sec) await tx.section.update({ where: { id: sec.id }, data: { tutorId: tutor.id } });
      else await tx.section.create({ data: { moduleId: mod.id, tutorId: tutor.id, name: 'A', academicSession } });
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
    where: { academicSession: await currentAcademicSession(), student: { role: 'student', isActive: true, ...(department && { department }) } }, include: { student: true, module: true },
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
  const en = await prisma.enrollment.findMany({ where: { academicSession: await currentAcademicSession(), student: { role: 'student', isActive: true } }, include: { module: true } });
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
