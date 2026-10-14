// Student screens: dashboard, summary, per-module records, browse & join modules.
const { prisma } = require('../lib/prisma');
const { env } = require('../config/env');
const { loadMatrix, enrolledModuleIds } = require('./stats.service');
const { sessionStart, round1 } = require('../utils/format');
const { NotFound, Forbidden, Conflict, BadRequest } = require('../utils/errors');
const { normalizeEnrolmentKey } = require('../utils/enrolment-key');
const { currentAcademicSession } = require('../lib/academicSession');

/** One card per enrolled module with its attendance %. */
async function dashboard(studentId) {
  const en = await prisma.enrollment.findMany({ where: { studentId, academicSession: await currentAcademicSession() }, include: { module: true }, orderBy: { module: { code: 'asc' } } });
  const m = await loadMatrix(en.map((e) => e.moduleId), [studentId]);
  return en.map((e) => {
    const pct = m.pct(studentId, e.moduleId) ?? 0;
    return { id: e.moduleId, name: e.module.name, code: e.module.code, pct, atRisk: pct < env.atRiskPct, belowRequired: pct < env.requiredPct };
  });
}

/** Headline numbers: overall rate, sessions missed, hours missed. */
async function summary(studentId) {
  const mods = await enrolledModuleIds(studentId);
  const t = (await loadMatrix(mods, [studentId])).overallTally(studentId, mods);
  return {
    rate: t.total ? Math.round((t.present / t.total) * 100) : 0,
    absences: t.missed,
    absentHours: round1(t.missedHours),
    required: env.requiredPct,
  };
}

/** Session-by-session list for one module, split into theory and practical. */
async function moduleRecords(studentId, moduleId) {
  const enrolled = await prisma.enrollment.findUnique({ where: { studentId_moduleId_academicSession: { studentId, moduleId, academicSession: await currentAcademicSession() } } });
  if (!enrolled) throw Forbidden('You are not enrolled in this module', 'NOT_ENROLLED');
  const m = await loadMatrix([moduleId], [studentId]);
  const rows = m.sessionsOf(moduleId)
    .map((s) => ({ date: sessionStart(s), hours: s.duration / 60, type: s.sessionType, status: m.attendedSession(studentId, s.id) ? 'present' : 'absent' }))
    .reverse();
  const part = (type) => ({ rows: rows.filter((r) => r.type === type), pct: m.pct(studentId, moduleId, type) ?? 0 });
  return { theory: part('theory'), practical: part('practical'), total: m.pct(studentId, moduleId) ?? 0 };
}

/**
 * Every module in every programme's curriculum (program_modules), so a shared module appears
 * under each programme/year/semester it belongs to. The enrolment key is never sent.
 */
async function browseModules(studentId) {
  const academicSession = await currentAcademicSession();
  const [rows, mine] = await Promise.all([
    prisma.programModule.findMany({
      include: {
        program: true,
        module: {
          include: {
            // this semester's tutor and class size only
            sections: { where: { academicSession }, take: 1, include: { tutor: { select: { name: true } } } },
            _count: { select: { enrollments: { where: { academicSession } } } },
          },
        },
      },
      orderBy: { module: { code: 'asc' } },
    }),
    enrolledModuleIds(studentId),
  ]);
  return rows.map(({ module: m, program, year, semester }) => ({
    id: m.id, name: m.name, code: m.code, year, semester, department: program.name,
    section: m.sections[0]?.name, students: m._count.enrollments, selfEnrol: m.selfEnrol, enrolled: mine.includes(m.id),
    tutor: m.sections[0]?.tutor?.name || null, // null = admin hasn't assigned a tutor yet
    hasKey: Boolean(m.enrolmentKey),           // the key itself is never sent
  }));
}

/**
 * Join a module, like Moodle: the student picks the module and types that module's key.
 * Without a module, the key alone is looked up. Refused when the tutor closed self-enrolment.
 */
async function enrol(studentId, { module, key }) {
  const k = normalizeEnrolmentKey(key);
  const m = module
    ? await prisma.module.findUnique({ where: { id: module } })
    : await prisma.module.findFirst({ where: { enrolmentKey: { equals: k, mode: 'insensitive' } } });
  if (!m) throw NotFound(module ? 'Module not found' : 'Enrolment key not found. Check it with your tutor.', module ? 'MODULE_NOT_FOUND' : 'KEY_NOT_FOUND');
  if (!m.selfEnrol) throw Forbidden('Self-enrolment is closed for this module. Ask your tutor to add you.', 'SELF_ENROL_CLOSED');
  if (!m.enrolmentKey || m.enrolmentKey.toUpperCase() !== k) throw BadRequest('Wrong enrolment key for this module', 'WRONG_KEY');
  const academicSession = await currentAcademicSession();
  const exists = await prisma.enrollment.findUnique({ where: { studentId_moduleId_academicSession: { studentId, moduleId: m.id, academicSession } } });
  if (exists) throw Conflict(`You are already enrolled in ${m.name}`, 'ALREADY_ENROLLED');
  await prisma.enrollment.create({ data: { studentId, moduleId: m.id, academicSession } });
  return { message: `Joined ${m.name}`, module: { id: m.id, code: m.code, name: m.name } };
}

module.exports = { dashboard, summary, moduleRecords, browseModules, enrol };
