// ─────────────────────────────────────────────────────────────
// THE attendance maths, in one place. Every dashboard, report,
// export and alert uses this, so the numbers always agree.
//
// Credit-based (hour-weighted): a 2-hour practical counts twice as
// much as a 1-hour lecture.
//
//   attendance % = hours attended (Present or Late)
//                  ─────────────────────────────── × 100
//                  hours of sessions already held
//
// A session counts once its start time has passed. A student with
// no record for a held session is absent.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { ATTENDED } = require('../config/constants');
const { sessionStart, round1, apiStatus } = require('../utils/format');

const hoursOf = (s) => (s.duration || 60) / 60;
const isHeld = (s, now = Date.now()) => sessionStart(s).getTime() <= now;

/** Held sessions of one module, oldest first. */
async function heldSessions(moduleId) {
  const all = await prisma.classSession.findMany({
    where: { section: { moduleId } }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });
  return all.filter((s) => isHeld(s));
}

/**
 * Loads sessions + attended records for many modules in 2 queries, then
 * answers % questions from memory. Use this for lists and reports.
 */
async function loadMatrix(moduleIds, studentIds) {
  const sessions = (await prisma.classSession.findMany({
    where: { section: { moduleId: { in: moduleIds } } },
    select: { id: true, date: true, startTime: true, duration: true, sessionType: true, section: { select: { moduleId: true } } },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })).filter((s) => isHeld(s));

  const att = await prisma.attendance.findMany({
    where: { sessionId: { in: sessions.map((s) => s.id) }, status: { in: ATTENDED }, ...(studentIds && { studentId: { in: studentIds } }) },
    select: { studentId: true, sessionId: true },
  });

  const byModule = new Map();
  for (const s of sessions) {
    if (!byModule.has(s.section.moduleId)) byModule.set(s.section.moduleId, []);
    byModule.get(s.section.moduleId).push(s);
  }
  const got = new Set(att.map((a) => `${a.studentId}|${a.sessionId}`));
  const attendedSession = (studentId, sessionId) => got.has(`${studentId}|${sessionId}`);

  /** Hour totals for a student over a list of sessions. */
  const tally = (studentId, list) => {
    let total = 0, present = 0, missed = 0, missedHours = 0;
    for (const s of list) {
      total += hoursOf(s);
      if (attendedSession(studentId, s.id)) present += hoursOf(s);
      else { missed++; missedHours += hoursOf(s); }
    }
    return { total, present, missed, missedHours, sessions: list.length };
  };
  const pctOf = (t) => (t.total ? round1((t.present / t.total) * 100) : null);

  return {
    sessionsOf: (moduleId) => byModule.get(moduleId) || [],
    attendedSession,
    /** % in one module; type = 'theory' | 'practical' to split. null when nothing held yet. */
    pct: (studentId, moduleId, type) => pctOf(tally(studentId, (byModule.get(moduleId) || []).filter((s) => !type || s.sessionType === type))),
    tally: (studentId, moduleId) => tally(studentId, byModule.get(moduleId) || []),
    /** Overall % across several modules (hour-weighted, not an average of averages). */
    overall: (studentId, mods) => pctOf(tally(studentId, mods.flatMap((m) => byModule.get(m) || []))),
    overallTally: (studentId, mods) => tally(studentId, mods.flatMap((m) => byModule.get(m) || [])),
  };
}

const enrolledModuleIds = async (studentId) =>
  (await prisma.enrollment.findMany({ where: { studentId }, select: { moduleId: true } })).map((e) => e.moduleId);

/** One student's % in one module (0 when nothing held yet — matches the old API). */
async function modulePct(studentId, moduleId) {
  return (await loadMatrix([moduleId], [studentId])).pct(studentId, moduleId) ?? 0;
}

/** One student's overall % across all enrolled modules. */
async function overallPct(studentId) {
  const mods = await enrolledModuleIds(studentId);
  return (await loadMatrix(mods, [studentId])).overall(studentId, mods) ?? 0;
}

/** Overall % for many students at once: Map(studentId → %). */
async function overallFor(studentIds) {
  const en = await prisma.enrollment.findMany({ where: { studentId: { in: studentIds } }, select: { studentId: true, moduleId: true } });
  const mods = [...new Set(en.map((e) => e.moduleId))];
  const m = await loadMatrix(mods, studentIds);
  const byStudent = new Map(studentIds.map((id) => [id, []]));
  en.forEach((e) => byStudent.get(e.studentId).push(e.moduleId));
  return new Map(studentIds.map((id) => [id, m.overall(id, byStudent.get(id)) ?? 0]));
}

/**
 * Calendar: { day: 'present' | 'flagged' | 'absent' } for a month.
 * When a day has several sessions the best status wins.
 */
async function monthDays(studentId, moduleIds, month) {
  const [y, mo] = month.split('-').map(Number);
  const sessions = (await prisma.classSession.findMany({
    where: { section: { moduleId: { in: moduleIds } }, date: { gte: new Date(Date.UTC(y, mo - 1, 1)), lt: new Date(Date.UTC(y, mo, 1)) } },
  })).filter((s) => isHeld(s));
  const att = await prisma.attendance.findMany({ where: { studentId, sessionId: { in: sessions.map((s) => s.id) } } });
  const rank = { absent: 0, flagged: 1, present: 2 }, out = {};
  for (const s of sessions) {
    const r = att.find((a) => a.sessionId === s.id), st = r ? apiStatus(r.status) : 'absent', d = s.date.getUTCDate();
    if (!out[d] || rank[st] > rank[out[d]]) out[d] = st;
  }
  return out;
}

/** Class rate for a set of sessions: attended records ÷ (sessions × class size). */
async function classRate(sessions, classSize) {
  if (!sessions.length || !classSize) return 0;
  const n = await prisma.attendance.count({ where: { sessionId: { in: sessions.map((s) => s.id) }, status: { in: ATTENDED } } });
  return round1((n / (sessions.length * classSize)) * 100);
}

module.exports = { hoursOf, isHeld, heldSessions, loadMatrix, enrolledModuleIds, modulePct, overallPct, overallFor, monthDays, classRate };
