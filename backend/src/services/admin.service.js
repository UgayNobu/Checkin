// ─────────────────────────────────────────────────────────────
// Admin: overview counts, programmes, users, modules, tutor
// approvals, at-risk reports and the low-attendance alert job.
// Every change is written to the audit log.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { env } = require('../config/env');
const { DAY_MS } = require('../config/constants');
const { roleIn, roleOut, userOut, monthStart, round1 } = require('../utils/format');
const { hashPassword, isStrongPassword, PASSWORD_RULE } = require('../utils/password');
const { normalizeId } = require('../utils/id-format');
const { BadRequest, NotFound, Conflict } = require('../utils/errors');
const { loadMatrix, overallFor } = require('./stats.service');
const { writeAuditLog } = require('./audit.service');
const { notify } = require('./notifications.service');
const { sendSmsInBackground } = require('../lib/sms');
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

// ── Tutor accounts (created by the admin — no sign-up, no approval) ──
// Flow: admin creates the tutor (staff ID, name, email, department, default password)
//   → the tutor gets an email (+ SMS if set up) with the login details
//   → admin assigns the tutor's modules for this semester
//   → tutor logs in, is asked to change the default password, sees their modules.
const STAFF_ID = /^CST-[A-Z0-9]{2,6}$/;

async function createTutor(adminId, { userId, name, email, phone, department, programme, password }) {
  const id = normalizeId(userId);
  if (!STAFF_ID.test(id)) throw BadRequest('Staff ID looks like CST-0142', 'BAD_STAFF_ID');
  const pw = password || env.defaultTutorPassword;
  if (!isStrongPassword(pw)) throw BadRequest(`Default password: ${PASSWORD_RULE}`, 'WEAK_PASSWORD');
  if (await prisma.user.findUnique({ where: { id } })) throw Conflict('An account with this staff ID already exists', 'ID_TAKEN');
  if (await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })) throw Conflict('An account with this email already exists', 'EMAIL_TAKEN');

  const u = await prisma.user.create({
    data: {
      id, name, email, phone: phone || null, department: department || null, programme: programme || null,
      role: 'tutor', isActive: true, status: 'active', passwordHash: await hashPassword(pw),
      prefs: { mustChangePassword: true },
    },
  });
  await writeAuditLog(adminId, 'Created tutor', `${u.name} (${u.id})`);
  await notify(u.id,
    `Welcome to CheckIn, ${u.name}. Your tutor account is ready.\nStaff ID: ${u.id}\nDefault password: ${pw}\nPlease log in and change your password. Your modules will appear once the admin assigns them.`,
    'System', { email: 'Your CheckIn tutor account', sms: false });
  // Short text so the login details fit in one SMS (160 characters)
  if (u.phone) sendSmsInBackground({ to: u.phone, text: `Tutor account ready. ID ${u.id}, password ${pw}. Log in and change it.` });
  return { ...userOut(u), defaultPassword: pw };
}

/** The tutor's modules this semester (ids), for the "Assign modules" screen. */
async function tutorModules(tutorId) {
  const secs = await prisma.section.findMany({ where: { tutorId, academicSession: await currentAcademicSession() }, include: { module: true } });
  const seen = new Set();
  return secs.filter((s) => (seen.has(s.moduleId) ? false : seen.add(s.moduleId)))
    .map((s) => ({ id: s.moduleId, code: s.module.code, name: s.module.name }));
}

/**
 * Admin assigns modules to a tutor for this semester (moduleIds = modules to give this tutor).
 * A module that already has a tutor this semester moves to this tutor; past semesters keep
 * the tutor who taught them. A module always needs a tutor (sections.tutor_id is required),
 * so a module is "taken away" by assigning it to another tutor, never left empty.
 */
async function assignTutorModules(adminId, tutorId, moduleIds) {
  const tutor = await prisma.user.findFirst({ where: { id: tutorId, role: 'tutor' } });
  if (!tutor) throw NotFound('Tutor not found', 'TUTOR_NOT_FOUND');
  if (!tutor.isActive) throw BadRequest('Activate this tutor before assigning modules', 'TUTOR_INACTIVE');
  const academicSession = await currentAcademicSession();
  const wanted = [...new Set(moduleIds)];
  const mods = await prisma.module.findMany({ where: { id: { in: wanted } } });
  if (mods.length !== wanted.length) throw NotFound('One of the modules was not found', 'MODULE_NOT_FOUND');

  const before = (await tutorModules(tutorId)).map((m) => m.id);
  const added = wanted.filter((m) => !before.includes(m));
  const movedFrom = [];

  await prisma.$transaction(async (tx) => {
    for (const moduleId of added) {
      const sec = await tx.section.findFirst({ where: { moduleId, academicSession } });
      if (sec) {
        if (sec.tutorId !== tutorId) movedFrom.push({ moduleId, from: sec.tutorId });
        await tx.section.update({ where: { id: sec.id }, data: { tutorId } });
      } else {
        await tx.section.create({ data: { moduleId, tutorId, name: 'A', academicSession } });
      }
    }
  });

  const label = (id) => { const m = mods.find((x) => x.id === id); return `${m.code} – ${m.name}`; };
  if (added.length) {
    await notify(tutorId, `You were assigned to teach: ${added.map(label).join(', ')}.`, 'System', { email: 'New modules assigned to you' });
  }
  for (const mv of movedFrom) {
    await notify(mv.from, `${label(mv.moduleId)} was moved to another tutor by the admin.`, 'System');
  }
  await writeAuditLog(adminId, 'Assigned tutor modules', `${tutor.name} (${tutor.id}): ${added.map(label).join(', ') || 'no change'}`);
  return { tutorId, modules: await tutorModules(tutorId), added: added.length };
}

/** Admin sets a tutor's password back to the default (e.g. they forgot it and email isn't set up). */
async function resetTutorPassword(adminId, tutorId) {
  const u = await prisma.user.findFirst({ where: { id: tutorId, role: 'tutor' } });
  if (!u) throw NotFound('Tutor not found', 'TUTOR_NOT_FOUND');
  const pw = env.defaultTutorPassword;
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(pw), prefs: { ...(u.prefs || {}), mustChangePassword: true } } });
  await writeAuditLog(adminId, 'Reset tutor password', `${u.name} (${u.id})`);
  await notify(u.id, `Your CheckIn password was reset by the admin. Default password: ${pw}. Please log in and change it.`, 'System', { email: 'Your CheckIn password was reset', sms: 'always' });
  return { userId: u.id, defaultPassword: pw };
}

/** Admin screen: every tutor with the modules they teach this semester. */
async function listTutors() {
  const academicSession = await currentAcademicSession();
  const tutors = await prisma.user.findMany({
    where: { role: 'tutor' }, orderBy: { name: 'asc' },
    include: { sections: { where: { academicSession }, include: { module: { select: { id: true, code: true, name: true } } } } },
  });
  return tutors.map((t) => {
    const seen = new Set();
    const modules = t.sections.filter((s) => (seen.has(s.moduleId) ? false : seen.add(s.moduleId))).map((s) => s.module);
    return { ...userOut(t), modules, mustChangePassword: Boolean(t.prefs?.mustChangePassword) };
  });
}

// ── Tutor approvals (old sign-up requests only) ──────────────
// Tutors no longer sign up; these routes stay so requests made before the change can still be cleared.
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
    return { userId: u.id, name: u.name, programme: u.programme, year: u.year, pct: p, status: p == null ? 'No classes yet' : p < env.atRiskPct ? 'At risk' : 'OK' };
  });
  const had = rows.filter((r) => r.pct != null);
  const avg = had.length ? round1(had.reduce((a, r) => a + r.pct, 0) / had.length) : null;
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
  createTutor, tutorModules, assignTutorModules, resetTutorPassword, listTutors,
  pendingTutors, approveTutor, rejectTutor, atRisk, programmeReport, runLowAttendanceJob,
};
