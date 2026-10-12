// ─────────────────────────────────────────────────────────────
// Class sessions from the tutor's side: start (generate a code),
// live counter, roster, end, and reviewing flagged check-ins.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { env } = require('../config/env');
const { ATTENDED, SESSION_STATUS } = require('../config/constants');
const { generateCheckInCode } = require('../utils/code');
const { apiStatus, sessionStart, flagText } = require('../utils/format');
const { NotFound, Conflict, BadRequest } = require('../utils/errors');
const { assertTutorOwnsModule } = require('./module.service');
const { notify } = require('./notifications.service');

const latestCode = { orderBy: { expiryTimestamp: 'desc' }, take: 1 };

/** Loads a session and checks this tutor teaches it. "Not found" hides other tutors' sessions. */
async function ownedSession(id, tutorId) {
  const se = await prisma.classSession.findUnique({ where: { id }, include: { section: { include: { module: true } }, codes: latestCode } });
  if (!se || se.section.tutorId !== tutorId) throw NotFound('Session not found', 'SESSION_NOT_FOUND');
  return se;
}

/** A code that has never been used before, so an old code can never open a new session. */
async function uniqueCode() {
  for (let i = 0; i < 10; i++) {
    const code = generateCheckInCode();
    const clash = await prisma.attendanceCode.findFirst({ where: { code } });
    if (!clash) return code;
  }
  throw new Error('Could not generate a unique code, try again');
}

/**
 * Start attendance. Either:
 *  • { module, type, hours, room } → creates today's session now, or
 *  • { sessionId } → re-opens an existing (scheduled/ongoing) session with a fresh code.
 * The tutor's current GPS becomes the classroom centre for the geofence.
 */
async function startSession(tutorId, b) {
  const minutes = b.minutes ?? env.codeValidityMinutes, radius = b.radius ?? env.geofenceMetres;
  const now = new Date(), expiry = new Date(Date.now() + minutes * 60_000);
  const code = await uniqueCode();
  const codeData = { code, expiryTimestamp: expiry, geofenceRadius: radius, latitude: b.lat, longitude: b.lng };

  if (b.sessionId) {
    const se = await ownedSession(b.sessionId, tutorId);
    if (se.status === SESSION_STATUS.ENDED) throw Conflict('This session has already ended', 'SESSION_ENDED');
    const live = se.codes[0];
    if (se.status === SESSION_STATUS.ONGOING && live && live.expiryTimestamp > now) return { _id: se.id, code: live.code, expiresAt: live.expiryTimestamp };
    await prisma.$transaction([
      prisma.attendanceCode.create({ data: { sessionId: se.id, ...codeData } }),
      prisma.classSession.update({ where: { id: se.id }, data: { status: SESSION_STATUS.ONGOING } }),
    ]);
    return { _id: se.id, code, expiresAt: expiry };
  }

  const sec = await assertTutorOwnsModule(b.module, tutorId);
  if (b.room && b.room !== sec.room) await prisma.section.update({ where: { id: sec.id }, data: { room: b.room } });
  const se = await prisma.classSession.create({
    data: {
      sectionId: sec.id, date: now, startTime: now, duration: Math.round(b.hours * 60), sessionType: b.type,
      status: SESSION_STATUS.ONGOING, codes: { create: codeData },
    },
  });
  return { _id: se.id, code, expiresAt: expiry, radius, minutes };
}

/**
 * Ends a session and records every enrolled student who never checked in as Absent.
 * Safe to call twice: an ended session is left alone.
 */
async function finalizeSession(sessionId) {
  const se = await prisma.classSession.findUnique({ where: { id: sessionId }, include: { section: true } });
  if (!se || se.status === SESSION_STATUS.ENDED) return;
  const [enrolled, att] = await Promise.all([
    prisma.enrollment.findMany({ where: { moduleId: se.section.moduleId }, select: { studentId: true } }),
    prisma.attendance.findMany({ where: { sessionId }, select: { studentId: true } }),
  ]);
  const checkedIn = new Set(att.map((a) => a.studentId));
  const missing = enrolled.filter((e) => !checkedIn.has(e.studentId));
  await prisma.$transaction([
    prisma.attendance.createMany({ data: missing.map((e) => ({ studentId: e.studentId, sessionId, status: 'Absent' })), skipDuplicates: true }),
    prisma.classSession.update({ where: { id: sessionId }, data: { status: SESSION_STATUS.ENDED } }),
  ]);
}

/**
 * Closes every ongoing session whose code (plus the network grace time) has run out.
 * server.js runs this every minute, so absences are recorded even if the tutor closes the page.
 */
async function sweepExpiredSessions() {
  const cutoff = new Date(Date.now() - env.networkGraceSeconds * 1000);
  const expired = await prisma.classSession.findMany({
    where: { status: SESSION_STATUS.ONGOING, codes: { some: {}, every: { expiryTimestamp: { lte: cutoff } } } },
    select: { id: true },
  });
  for (const x of expired) await finalizeSession(x.id);
  return expired.length;
}

/** Small counter the start page polls every few seconds. Also closes the session once time is up. */
async function live(id, tutorId) {
  const se = await ownedSession(id, tutorId), c = se.codes[0];
  let status = se.status;
  const graceOver = c && c.expiryTimestamp.getTime() + env.networkGraceSeconds * 1000 <= Date.now();
  if (status === SESSION_STATUS.ONGOING && graceOver) { await finalizeSession(se.id); status = SESSION_STATUS.ENDED; }

  const total = await prisma.enrollment.count({ where: { moduleId: se.section.moduleId } });
  const list = await prisma.attendance.findMany({ where: { sessionId: se.id }, include: { student: true } });
  const present = list.filter((a) => ATTENDED.includes(a.status)).length;
  const flagged = list.filter((a) => apiStatus(a.status) === 'flagged');
  return {
    code: c?.code ?? null, expiresAt: c?.expiryTimestamp ?? null, status, total,
    checkedIn: present,
    absent: Math.max(0, total - present - flagged.length),
    flagged: flagged.map((a) => ({ id: a.id, attendanceId: a.id, name: a.student.name, flagReason: a.flagReason, reason: flagText(a.flagReason) })),
  };
}

async function listMine(tutorId, { limit, status }) {
  const rows = await prisma.classSession.findMany({
    where: { section: { tutorId }, ...(status && { status }) },
    include: { section: { include: { module: true } }, _count: { select: { attendance: true } } },
    orderBy: [{ date: 'desc' }, { startTime: 'desc' }], take: limit,
  });
  return rows.map((x) => ({
    _id: x.id, module: { id: x.section.moduleId, code: x.section.module.code, name: x.section.module.name },
    section: x.section.name, room: x.section.room, date: sessionStart(x), hours: x.duration / 60, type: x.sessionType, status: x.status, checkIns: x._count.attendance,
  }));
}

/** End now: expire any live code, mark the session ended and record the absentees. */
async function endSession(id, tutorId) {
  const se = await ownedSession(id, tutorId), now = new Date();
  await prisma.attendanceCode.updateMany({ where: { sessionId: se.id, expiryTimestamp: { gt: now } }, data: { expiryTimestamp: now } });
  await finalizeSession(se.id); // also marks everyone who didn't check in as Absent
  return { _id: se.id, status: SESSION_STATUS.ENDED };
}

/** Every enrolled student with their status for this session (starts from enrolments, so no-shows appear). */
async function roster(id, tutorId) {
  const se = await ownedSession(id, tutorId), c = se.codes[0];
  const [en, att] = await Promise.all([
    prisma.enrollment.findMany({ where: { moduleId: se.section.moduleId }, include: { student: true }, orderBy: { studentId: 'asc' } }),
    prisma.attendance.findMany({ where: { sessionId: se.id } }),
  ]);
  const byStudent = new Map(att.map((a) => [a.studentId, a]));
  const rows = en.map(({ student: u }) => {
    const a = byStudent.get(u.id);
    return {
      attendanceId: a?.id ?? null, userId: u.id, name: u.name, status: a ? apiStatus(a.status) : 'absent', time: a?.timestamp ?? null,
      flagReason: a?.flagReason ?? null, reason: flagText(a?.flagReason), distance: a?.distanceMeters ?? null, accuracy: a?.accuracy ?? null,
    };
  });
  const n = (st) => rows.filter((r) => r.status === st).length;
  return {
    session: {
      _id: se.id, module: { code: se.section.module.code, name: se.section.module.name }, date: sessionStart(se), type: se.sessionType,
      status: se.status, code: c?.code ?? null, expiresAt: c?.expiryTimestamp ?? null, radius: c?.geofenceRadius ?? null,
    },
    counts: { enrolled: rows.length, present: n('present'), flagged: n('flagged'), absent: n('absent') },
    rows,
  };
}

/** Tutor accepts (→ Present) or rejects (→ Absent) a flagged check-in. */
async function decideFlagged(id, attendanceId, tutorId, accept, note) {
  const se = await ownedSession(id, tutorId);
  const a = await prisma.attendance.findUnique({ where: { id: attendanceId } });
  if (!a || a.sessionId !== se.id) throw NotFound('Check-in not found');
  if (apiStatus(a.status) !== 'flagged') throw BadRequest('This check-in is not flagged', 'NOT_FLAGGED');
  const flagReason = note ? `${a.flagReason || 'reviewed'} - ${note}`.slice(0, 100) : a.flagReason;
  await prisma.attendance.update({ where: { id: a.id }, data: { status: accept ? 'Present' : 'Absent', flagReason } });
  await notify(a.studentId, `Your flagged check-in for ${se.section.module.code} was ${accept ? 'accepted' : 'marked absent'} by your tutor.`, 'Attendance');
  return { attendanceId: a.id, status: accept ? 'present' : 'absent' };
}

/** Manually mark a student (e.g. phone died): creates or overwrites their record. */
async function markManually(id, tutorId, studentId, present) {
  const se = await ownedSession(id, tutorId);
  const enrolled = await prisma.enrollment.findUnique({ where: { studentId_moduleId: { studentId, moduleId: se.section.moduleId } } });
  if (!enrolled) throw BadRequest('That student is not enrolled in this module', 'NOT_ENROLLED');
  const status = present ? 'Present' : 'Absent', flagReason = 'marked_by_tutor';
  await prisma.attendance.upsert({
    where: { studentId_sessionId: { studentId, sessionId: se.id } },
    update: { status, flagReason }, create: { studentId, sessionId: se.id, status, flagReason },
  });
  return { userId: studentId, status: present ? 'present' : 'absent' };
}

module.exports = { ownedSession, startSession, finalizeSession, sweepExpiredSessions, live, listMine, endSession, roster, decideFlagged, markManually };
