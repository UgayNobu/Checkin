// ─────────────────────────────────────────────────────────────
// Management dashboards (read-only), drilling down:
// college → department → module → student.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { env } = require('../config/env');
const { WEEK_MS } = require('../config/constants');
const { loadMatrix, overallFor, monthDays } = require('./stats.service');
const { sessionStart, round1 } = require('../utils/format');
const { NotFound } = require('../utils/errors');

async function sizes(moduleIds) {
  const g = await prisma.enrollment.groupBy({ by: ['moduleId'], where: { moduleId: { in: moduleIds } }, _count: { _all: true } });
  return new Map(g.map((x) => [x.moduleId, x._count._all]));
}

/** Expected attendances (sessions × class size) vs actual Present/Late records. */
function rateOf(m, mods, size, from = 0, to = Infinity) {
  let exp = 0, got = 0;
  for (const mod of mods) {
    const ses = m.sessionsOf(mod.id).filter((s) => { const t = sessionStart(s).getTime(); return t >= from && t < to; });
    const n = size.get(mod.id) || 0;
    exp += ses.length * n;
    got += ses.reduce((a, s) => a + m.studentsWho(s.id), 0);
  }
  return exp ? round1((got / exp) * 100) : 0;
}

/** loadMatrix + "how many students attended session X". */
async function matrixWithCounts(moduleIds) {
  const m = await loadMatrix(moduleIds);
  const sessionIds = moduleIds.flatMap((id) => m.sessionsOf(id).map((s) => s.id));
  const g = await prisma.attendance.groupBy({ by: ['sessionId'], where: { sessionId: { in: sessionIds }, status: { in: ['Present', 'Late'] } }, _count: { _all: true } });
  const per = new Map(g.map((x) => [x.sessionId, x._count._all]));
  m.studentsWho = (sessionId) => per.get(sessionId) || 0;
  return m;
}

async function overview() {
  const programs = await prisma.program.findMany({ orderBy: { name: 'asc' }, include: { modules: true } });
  const allMods = programs.flatMap((p) => p.modules);
  const [m, size] = await Promise.all([matrixWithCounts(allMods.map((x) => x.id)), sizes(allMods.map((x) => x.id))]);
  const departments = await Promise.all(programs.map(async (p) => ({
    department: p.name,
    students: await prisma.user.count({ where: { role: 'student', department: p.name } }),
    modules: p.modules.length,
    attendance: rateOf(m, p.modules, size),
  })));
  const [students, newStudents, tutors, modules] = await Promise.all([
    prisma.user.count({ where: { role: 'student' } }),
    prisma.user.count({ where: { role: 'student', createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }),
    prisma.user.count({ where: { role: 'tutor', isActive: true } }),
    prisma.module.count(),
  ]);
  return { totals: { students, newStudents, tutors, modules, below80: departments.filter((d) => d.attendance < env.atRiskPct).length }, departments };
}

async function department(name) {
  const mods = await prisma.module.findMany({ where: { program: { name } }, orderBy: { code: 'asc' } });
  const [m, size] = await Promise.all([matrixWithCounts(mods.map((x) => x.id)), sizes(mods.map((x) => x.id))]);
  const studs = await prisma.user.findMany({ where: { role: 'student', department: name }, select: { id: true } });
  const pcts = [...(await overallFor(studs.map((u) => u.id))).values()];
  const now = Date.now();
  const trend = Array.from({ length: 6 }, (_, i) => { const a = now - (6 - i) * WEEK_MS; return rateOf(m, mods, size, a, a + WEEK_MS); });
  return {
    students: studs.length,
    avg: pcts.length ? round1(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0,
    atRisk: pcts.filter((p) => p < env.atRiskPct).length,
    trend,
    modules: mods.map((x) => ({ id: x.id, name: x.name, code: x.code, year: x.year, attendance: rateOf(m, [x], size) })),
  };
}

async function moduleView(id) {
  const mod = await prisma.module.findUnique({ where: { id } });
  if (!mod) throw NotFound('Module not found');
  const [en, m, relief] = await Promise.all([
    prisma.enrollment.findMany({ where: { moduleId: id }, include: { student: true } }),
    loadMatrix([id]),
    prisma.evidenceDocument.count({ where: { moduleId: id, status: 'Approved' } }),
  ]);
  const rows = en.map(({ student: u }) => {
    const t = m.tally(u.id, id);
    return { id: u.id, userId: u.id, name: u.name, absences: t.missed, absentH: round1(t.missedHours), pct: m.pct(u.id, id) ?? 0 };
  });
  return { module: { name: mod.name, code: mod.code }, totals: { students: rows.length, absence: rows.reduce((a, r) => a + r.absences, 0), relief }, rows };
}

async function studentView(studentId, moduleId) {
  const st = await prisma.user.findUnique({ where: { id: studentId } });
  if (!st) throw NotFound('Student not found');
  const m = await loadMatrix([moduleId], [studentId]);
  const history = m.sessionsOf(moduleId).map((s) => ({ date: sessionStart(s), type: s.sessionType, status: m.attendedSession(studentId, s.id) ? 'present' : 'absent' }));
  const present = history.filter((h) => h.status === 'present').length;
  return { student: { userId: st.id, name: st.name }, present, absent: history.length - present, total: history.length, pct: m.pct(studentId, moduleId) ?? 0, history };
}

async function teachers() {
  const secs = await prisma.section.findMany({ include: { module: true, tutor: true, sessions: { select: { duration: true } } }, orderBy: { module: { code: 'asc' } } });
  return {
    total: await prisma.user.count({ where: { role: 'tutor', isActive: true } }),
    rows: secs.map((x) => ({ module: `${x.module.code} – ${x.module.name}`, name: x.tutor.name, cls: x.name, hours: round1(x.sessions.reduce((a, y) => a + y.duration / 60, 0)) })),
  };
}

/** Searchable student × module list. */
async function history({ q, year, semester, department: dept }) {
  const mods = await prisma.module.findMany({
    where: { ...(year && { year }), ...(semester && { semester }), ...(dept && { program: { name: dept } }) },
    include: { enrollments: { include: { student: true } }, sections: { include: { tutor: true }, take: 1 } },
  });
  const m = await loadMatrix(mods.map((x) => x.id)), rows = [];
  for (const mod of mods) {
    for (const { student: u } of mod.enrollments) {
      if (q && !`${u.name || ''} ${u.id}`.toLowerCase().includes(q.toLowerCase())) continue;
      rows.push({ sid: u.id, mid: mod.id, name: u.name, userId: u.id, module: `${mod.code} – ${mod.name}`, teacher: mod.sections[0]?.tutor.name, pct: m.pct(u.id, mod.id) ?? 0 });
    }
  }
  return rows;
}

const calendar = ({ student, module, month }) => monthDays(student, [module], month);

module.exports = { overview, department, moduleView, studentView, teachers, history, calendar };
