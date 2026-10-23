// ─────────────────────────────────────────────────────────────
// Teacher screens: dashboard, my modules, attendance records,
// weekly reports and the CSV / PDF exports.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { env } = require('../config/env');
const { WEEK_MS, FLAGGED } = require('../config/constants');
const { loadMatrix } = require('./stats.service');
const { sessionStart, round1, apiStatus, flagText } = require('../utils/format');
const { NotFound } = require('../utils/errors');
const { assertTutorOwnsModule } = require('./module.service');
const { currentAcademicSession, sessionOrCurrent } = require('../lib/academicSession');
const pdf = require('../utils/pdf');

/** This semester's modules for a tutor. A tutor can teach 2 sections of one module — keep one entry per module. */
async function tutorSections(tutorId, { term } = {}) {
  const secs = await prisma.section.findMany({ where: { tutorId, academicSession: await sessionOrCurrent(term) }, include: { module: true }, orderBy: { module: { code: 'asc' } } });
  const seen = new Set();
  return secs.filter((s) => (seen.has(s.moduleId) ? false : seen.add(s.moduleId)));
}

async function enrolCounts(moduleIds, { term } = {}) {
  const g = await prisma.enrollment.groupBy({ by: ['moduleId'], where: { moduleId: { in: moduleIds }, academicSession: await sessionOrCurrent(term), student: { isActive: true } }, _count: { _all: true } });
  return new Map(g.map((x) => [x.moduleId, x._count._all]));
}

async function myModules(tutorId, { term } = {}) {
  const secs = await tutorSections(tutorId, { term }), counts = await enrolCounts(secs.map((s) => s.moduleId), { term });
  return secs.map((x) => ({
    id: x.moduleId, name: x.module.name, code: x.module.code, year: x.module.year, semester: x.module.semester,
    section: x.name, room: x.room, schedule: x.schedule, students: counts.get(x.moduleId) || 0, enrolmentKey: x.module.enrolmentKey, selfEnrol: x.module.selfEnrol,
  }));
}

/** Dashboard: totals, today's sessions, things waiting for the tutor. */
async function dashboard(tutorId) {
  const term = await currentAcademicSession();
  const mods = await myModules(tutorId);
  const ids = mods.map((m) => m.id);
  const today = new Date(new Date().toISOString().slice(0, 10)); // UTC midnight, matches @db.Date
  const [students, todays, flagged, pendingEvidence] = await Promise.all([
    prisma.enrollment.findMany({ where: { moduleId: { in: ids }, academicSession: term, student: { isActive: true } }, distinct: ['studentId'], select: { studentId: true } }),
    prisma.classSession.findMany({ where: { section: { tutorId }, date: today }, include: { section: { include: { module: true } }, _count: { select: { attendance: true } } }, orderBy: { startTime: 'asc' } }),
    prisma.attendance.count({ where: { status: { in: ['Flagged', 'Pending review'] }, session: { section: { tutorId, academicSession: term } } } }),
    prisma.evidenceDocument.count({ where: { status: 'Pending', module: { sections: { some: { tutorId, academicSession: term } } } } }),
  ]);
  const size = new Map(mods.map((m) => [m.id, m.students]));
  return {
    totals: { modules: mods.length, students: students.length, flaggedCheckIns: flagged, pendingEvidence },
    today: todays.map((s) => ({
      _id: s.id, code: s.section.module.code, name: s.section.module.name, room: s.section.room, start: sessionStart(s),
      hours: s.duration / 60, type: s.sessionType, status: s.status, checkedIn: s._count.attendance, enrolled: size.get(s.section.moduleId) || 0,
    })),
    modules: mods,
  };
}

/** One row per student: theory %, practical %, total % (null = no sessions yet) and how many check-ins are flagged. */
async function moduleRecords(moduleId, tutorId, { term } = {}) {
  term = await sessionOrCurrent(term); // ?session=AS2026 shows an old semester
  const [, en, m, flags] = await Promise.all([
    assertTutorOwnsModule(moduleId, tutorId, { term }),
    prisma.enrollment.findMany({ where: { moduleId, academicSession: term }, include: { student: true }, orderBy: { studentId: 'asc' } }),
    loadMatrix([moduleId], undefined, { term }),
    prisma.attendance.groupBy({ by: ['studentId'], where: { status: { in: FLAGGED }, session: { section: { moduleId, academicSession: term } } }, _count: { _all: true } }),
  ]);
  const flagged = new Map(flags.map((f) => [f.studentId, f._count._all]));
  return {
    sessions: m.sessionsOf(moduleId).length,
    rows: en.map(({ student: u }) => ({
      id: u.id, userId: u.id, name: u.name,
      theory: m.pct(u.id, moduleId, 'theory'), practical: m.pct(u.id, moduleId, 'practical'), total: m.pct(u.id, moduleId),
      flagged: flagged.get(u.id) || 0,
    })),
  };
}

/** One student, one module: a row per day with theory / practical status. */
async function studentRecord(moduleId, studentId, tutorId, { term } = {}) {
  term = await sessionOrCurrent(term);
  const [, st, m, allAtt] = await Promise.all([
    assertTutorOwnsModule(moduleId, tutorId, { term }),
    prisma.user.findUnique({ where: { id: studentId } }),
    loadMatrix([moduleId], [studentId], { term }),
    prisma.attendance.findMany({ where: { studentId, session: { section: { moduleId } } } }),
  ]);
  if (!st) throw NotFound('Student not found');
  const rows = {};
  const ses = m.sessionsOf(moduleId);
  const heldIds = new Set(ses.map((s) => s.id));
  const att = allAtt.filter((a) => heldIds.has(a.sessionId));
  const bySession = new Map(att.map((a) => [a.sessionId, a]));
  const RANK = { absent: 0, flagged: 1, present: 2 }; // best result wins if there are 2 sessions of a type on one day
  for (const s of ses) {
    const d = s.date.toISOString().slice(0, 10), a = bySession.get(s.id);
    const status = a ? apiStatus(a.status) : 'absent';
    rows[d] = rows[d] || { date: d };
    const prev = rows[d][s.sessionType];
    if (!prev || RANK[status] > RANK[prev]) {
      rows[d][s.sessionType] = status;
      rows[d][s.sessionType + 'Reason'] = status === 'flagged' ? flagText(a.flagReason) : null; // e.g. theoryReason
    }
  }
  return { student: { userId: st.id, name: st.name }, pct: m.pct(studentId, moduleId) ?? 0, rows: Object.values(rows) }; // oldest first
}

/** Last 6 weeks of class attendance per module + overall. */
async function reports(tutorId) {
  const mods = await myModules(tutorId), m = await loadMatrix(mods.map((x) => x.id)), now = Date.now();
  // All the numbers come from the one loadMatrix call (no extra query per week).
  return mods.map((mod) => {
    const ses = m.sessionsOf(mod.id);
    const weekClasses = [], weekStarts = [];
    const weeks = Array.from({ length: 6 }, (_, i) => {
      const a = now - (6 - i) * WEEK_MS, b = a + WEEK_MS; // i = 0 → 6 weeks ago, i = 5 → this week
      const list = ses.filter((s) => sessionStart(s) >= a && sessionStart(s) < b);
      weekClasses.push(list.length);
      weekStarts.push(new Date(a).toISOString());
      return list.length ? m.classRate(list, mod.students) : null; // null = no class that week (not 0%)
    });
    return {
      id: mod.id, code: mod.code, name: mod.name, students: mod.students, classes: ses.length,
      weeks, weekClasses, weekStarts, overall: ses.length ? m.classRate(ses, mod.students) : null,
    };
  });
}

const riskLabel = (t) => (t == null ? 'No sessions' : t < env.atRiskPct ? 'At risk' : 'OK');

async function exportRows(moduleId, tutorId, { term } = {}) {
  const { sessions, rows } = await moduleRecords(moduleId, tutorId, { term }); // checks ownership first
  const m = await prisma.module.findUnique({ where: { id: moduleId } });
  if (!m) throw NotFound('Module not found');
  return { m, sessions, rows };
}

const CSV_HEADER = ['Student ID', 'Name', 'Theory %', 'Practical %', 'Overall %', 'Status'];
const csvRows = (rows) => rows.map((r) => [r.userId, r.name, r.theory, r.practical, r.total, riskLabel(r.total)]);

/** Streams the module's attendance report as a PDF. */
function writeRecordsPdf(res, { m, sessions, rows }) {
  const doc = pdf.createPdf(res, `${m.code}-attendance.pdf`);
  pdf.addHeader(doc, 'CheckIn — Attendance Report', [
    `College of Science and Technology · ${m.code} ${m.name}`,
    `${sessions} sessions held · at risk below ${env.atRiskPct}% · generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
  ]);
  pdf.addTable(doc, [
    { label: 'Student ID', width: 80 }, { label: 'Name', width: 170 }, { label: 'Theory %', width: 65 },
    { label: 'Practical %', width: 70 }, { label: 'Overall %', width: 65 }, { label: 'Status', width: 65 },
  ], csvRows(rows));
  pdf.finalize(doc);
}

/** Design doc: one PDF listing all the tutor's modules with every student's %. */
async function writeModulesPdf(res, tutor) {
  const mods = await myModules(tutor.id);
  const doc = pdf.createPdf(res, 'my-modules-attendance.pdf');
  pdf.addHeader(doc, 'CheckIn — My Modules', [`${tutor.name} · ${mods.length} modules · generated ${new Date().toISOString().slice(0, 10)}`]);
  for (const mod of mods) {
    const { sessions, rows } = await moduleRecords(mod.id, tutor.id);
    const avg = rows.filter((r) => r.total != null);
    pdf.addSection(doc, `${mod.code} – ${mod.name}  (${rows.length} students, ${sessions} sessions${avg.length ? `, average ${round1(avg.reduce((a, r) => a + r.total, 0) / avg.length)}%` : ''})`);
    pdf.addTable(doc, [{ label: 'Student ID', width: 90 }, { label: 'Name', width: 200 }, { label: 'Overall %', width: 80 }, { label: 'Status', width: 80 }],
      rows.map((r) => [r.userId, r.name, r.total, riskLabel(r.total)]));
  }
  pdf.finalize(doc);
}

module.exports = { myModules, dashboard, moduleRecords, studentRecord, reports, exportRows, CSV_HEADER, csvRows, writeRecordsPdf, writeModulesPdf, riskLabel };
