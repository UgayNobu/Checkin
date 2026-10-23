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
const { sessionOrCurrent } = require('../lib/academicSession');

// Every view shows ONE semester: the current one, or { term: 'AS2026' } to look back.

/** Class size per module in a semester. */
async function sizes(moduleIds, term) {
  const g = await prisma.enrollment.groupBy({ by: ['moduleId'], where: { moduleId: { in: moduleIds }, academicSession: term, student: { isActive: true } }, _count: { _all: true } });
  return new Map(g.map((x) => [x.moduleId, x._count._all]));
}

/** Expected attendances (sessions × class size) vs actual Present/Late records. */
function rateOf(m, mods, size, from = 0, to = Infinity, { none = 0 } = {}) {
  let exp = 0, got = 0;
  for (const mod of mods) {
    const ses = m.sessionsOf(mod.id).filter((s) => { const t = sessionStart(s).getTime(); return t >= from && t < to; });
    const n = size.get(mod.id) || 0;
    exp += ses.length * n;
    got += ses.reduce((a, s) => a + m.studentsWho(s.id), 0);
  }
  return exp ? round1((got / exp) * 100) : none;
}
/** Attendance rate, or null when no classes were held yet (shown as "–", never counted as low). */
const rateOrNull = (m, mods, size) => rateOf(m, mods, size, 0, Infinity, { none: null });

/** loadMatrix + "how many students attended session X". */
// loadMatrix already counts how many students attended each session (m.studentsWho).
const matrixWithCounts = (moduleIds, term) => loadMatrix(moduleIds, undefined, { term });

async function overview({ term } = {}) {
  term = await sessionOrCurrent(term);
  // Everything that doesn't depend on something else is fetched at the same time.
  const [programs, perDept, students, newStudents, tutors, modules, studentIds] = await Promise.all([
    prisma.program.findMany({ orderBy: { name: 'asc' }, include: { modules: true } }),
    prisma.user.groupBy({ by: ['department'], where: { role: 'student', isActive: true }, _count: { _all: true } }), // students per programme in 1 query
    prisma.user.count({ where: { role: 'student', isActive: true } }),
    prisma.user.count({ where: { role: 'student', createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }),
    prisma.user.count({ where: { role: 'tutor', isActive: true } }),
    prisma.module.count(),
    prisma.user.findMany({ where: { role: 'student', isActive: true }, select: { id: true } }),
  ]);
  const allMods = programs.flatMap((p) => p.modules);
  const [m, size, pcts] = await Promise.all([
    matrixWithCounts(allMods.map((x) => x.id), term), sizes(allMods.map((x) => x.id), term), overallFor(studentIds.map((u) => u.id), { term }),
  ]);
  // Students whose overall attendance is under the required % (90 by default)
  // (students with no classes held yet are left out)
  const belowRequired = [...pcts.values()].filter((pct) => pct != null && pct < env.requiredPct).length;
  const studentsIn = new Map(perDept.map((g) => [g.department, g._count._all]));
  const departments = programs.map((p) => ({
    department: p.name,
    students: studentsIn.get(p.name) || 0,
    modules: p.modules.length,
    attendance: rateOrNull(m, p.modules, size),
  }));
  return {
    academicSession: term,
    totals: {
      students, newStudents, tutors, modules,
      below80: departments.filter((d) => d.attendance != null && d.attendance < env.atRiskPct).length, // departments under the at-risk %
      belowRequired, requiredPct: env.requiredPct,                             // students under the required %
    },
    departments,
  };
}

async function department(name, { term } = {}) {
  term = await sessionOrCurrent(term);
  const [mods, studs] = await Promise.all([
    prisma.module.findMany({ where: { program: { name } }, orderBy: { code: 'asc' } }),
    prisma.user.findMany({ where: { role: 'student', isActive: true, department: name }, select: { id: true } }),
  ]);
  const [m, size, pctMap] = await Promise.all([
    matrixWithCounts(mods.map((x) => x.id), term), sizes(mods.map((x) => x.id), term), overallFor(studs.map((u) => u.id), { term }),
  ]);
  const pcts = [...pctMap.values()].filter((p) => p != null); // only students who have had classes
  const now = Date.now();
  const trend = Array.from({ length: 6 }, (_, i) => { const a = now - (6 - i) * WEEK_MS; return rateOf(m, mods, size, a, a + WEEK_MS); });
  return {
    students: studs.length,
    avg: pcts.length ? round1(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
    atRisk: pcts.filter((p) => p < env.atRiskPct).length,
    trend,
    modules: mods.map((x) => ({ id: x.id, name: x.name, code: x.code, year: x.year, attendance: rateOrNull(m, [x], size) })),
  };
}

async function moduleView(id, { term } = {}) {
  term = await sessionOrCurrent(term);
  const [mod, en, m, evidence] = await Promise.all([
    prisma.module.findUnique({ where: { id } }),
    prisma.enrollment.findMany({ where: { moduleId: id, academicSession: term }, include: { student: true } }),
    loadMatrix([id], undefined, { term }),
    prisma.evidenceDocument.count({ where: { moduleId: id, status: 'Approved' } }),
  ]);
  if (!mod) throw NotFound('Module not found');
  const rows = en.map(({ student: u }) => {
    const t = m.tally(u.id, id);
    return { id: u.id, userId: u.id, name: u.name, absences: t.missed, absentH: round1(t.missedHours), pct: m.pct(u.id, id) };
  });
  return { module: { name: mod.name, code: mod.code }, totals: { students: rows.length, absence: rows.reduce((a, r) => a + r.absences, 0), evidence }, rows };
}

async function studentView(studentId, moduleId, { term } = {}) {
  const [st, m] = await Promise.all([prisma.user.findUnique({ where: { id: studentId } }), loadMatrix([moduleId], [studentId], { term })]);
  if (!st) throw NotFound('Student not found');
  const history = m.sessionsOf(moduleId).map((s) => ({ date: sessionStart(s), type: s.sessionType, status: m.attendedSession(studentId, s.id) ? 'present' : 'absent' }));
  const present = history.filter((h) => h.status === 'present').length;
  return { student: { userId: st.id, name: st.name }, present, absent: history.length - present, total: history.length, pct: m.pct(studentId, moduleId), history };
}

async function teachers({ term } = {}) {
  term = await sessionOrCurrent(term);
  const [secs, total, enrolled] = await Promise.all([
    prisma.section.findMany({ where: { academicSession: term }, include: { module: true, tutor: true, sessions: { select: { duration: true } } }, orderBy: { module: { code: 'asc' } } }),
    prisma.user.count({ where: { role: 'tutor', isActive: true } }),
    prisma.enrollment.groupBy({ by: ['moduleId'], where: { academicSession: term, student: { isActive: true } }, _count: { _all: true } }),
  ]);
  const students = new Map(enrolled.map((e) => [e.moduleId, e._count._all]));
  return {
    total,
    rows: secs.map((x) => ({
      module: `${x.module.code} – ${x.module.name}`, name: x.tutor.name, students: students.get(x.moduleId) || 0,
      classes: x.sessions.length, hours: round1(x.sessions.reduce((a, y) => a + y.duration / 60, 0)),
    })),
  };
}

/** Searchable student × module list. */
async function history({ q, year, semester, department: dept, session }) {
  const term = await sessionOrCurrent(session); // ?session=AS2026 → that semester's students and records
  const mods = await prisma.module.findMany({
    where: { ...(year && { year }), ...(semester && { semester }), ...(dept && { program: { name: dept } }) },
    include: {
      enrollments: { where: { academicSession: term }, include: { student: true } },
      sections: { where: { academicSession: term }, include: { tutor: true }, take: 1 },
    },
  });
  const m = await loadMatrix(mods.map((x) => x.id), undefined, { term }), rows = [];
  for (const mod of mods) {
    for (const { student: u } of mod.enrollments) {
      if (q && !`${u.name || ''} ${u.id}`.toLowerCase().includes(q.toLowerCase())) continue;
      rows.push({ sid: u.id, mid: mod.id, name: u.name, userId: u.id, module: `${mod.code} – ${mod.name}`, teacher: mod.sections[0]?.tutor.name, pct: m.pct(u.id, mod.id) });
    }
  }
  return rows;
}

const calendar = ({ student, module, month }) => monthDays(student, [module], month);

module.exports = { overview, department, moduleView, studentView, teachers, history, calendar };
