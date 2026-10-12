// Student screens: dashboard, summary, per-module records, browse & join modules.
const { prisma } = require('../lib/prisma');
const { env } = require('../config/env');
const { loadMatrix, enrolledModuleIds } = require('./stats.service');
const { sessionStart, round1 } = require('../utils/format');
const { NotFound, Forbidden, Conflict } = require('../utils/errors');
const { normalizeEnrolmentKey } = require('../utils/enrolment-key');

/** One card per enrolled module with its attendance %. */
async function dashboard(studentId) {
  const en = await prisma.enrollment.findMany({ where: { studentId }, include: { module: true }, orderBy: { module: { code: 'asc' } } });
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
  const enrolled = await prisma.enrollment.findUnique({ where: { studentId_moduleId: { studentId, moduleId } } });
  if (!enrolled) throw Forbidden('You are not enrolled in this module', 'NOT_ENROLLED');
  const m = await loadMatrix([moduleId], [studentId]);
  const rows = m.sessionsOf(moduleId)
    .map((s) => ({ date: sessionStart(s), hours: s.duration / 60, type: s.sessionType, status: m.attendedSession(studentId, s.id) ? 'present' : 'absent' }))
    .reverse();
  const part = (type) => ({ rows: rows.filter((r) => r.type === type), pct: m.pct(studentId, moduleId, type) ?? 0 });
  return { theory: part('theory'), practical: part('practical'), total: m.pct(studentId, moduleId) ?? 0 };
}

/** Every module, with how many students are in it. The enrolment key is never sent. */
async function browseModules(studentId) {
  const [mods, mine] = await Promise.all([
    prisma.module.findMany({ include: { program: true, sections: { take: 1 }, _count: { select: { enrollments: true } } }, orderBy: { code: 'asc' } }),
    enrolledModuleIds(studentId),
  ]);
  return mods.map((m) => ({
    id: m.id, name: m.name, code: m.code, year: m.year, semester: m.semester, department: m.program.name,
    section: m.sections[0]?.name, students: m._count.enrollments, enrolled: mine.includes(m.id),
  }));
}

/** Join a module with the key the tutor shared. */
async function enrol(studentId, key) {
  const k = normalizeEnrolmentKey(key);
  const m = await prisma.module.findFirst({ where: { enrolmentKey: { equals: k, mode: 'insensitive' } } });
  if (!m) throw NotFound('Enrolment key not found. Check it with your tutor.', 'KEY_NOT_FOUND');
  const exists = await prisma.enrollment.findUnique({ where: { studentId_moduleId: { studentId, moduleId: m.id } } });
  if (exists) throw Conflict(`You are already enrolled in ${m.name}`, 'ALREADY_ENROLLED');
  await prisma.enrollment.create({ data: { studentId, moduleId: m.id } });
  return { message: `Joined ${m.name}`, module: { id: m.id, code: m.code, name: m.name } };
}

module.exports = { dashboard, summary, moduleRecords, browseModules, enrol };
