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
const { sessionOrCurrent } = require('../lib/academicSession');
const { notify } = require('./notifications.service');
const { planStart } = require('./classChange.service');
const { buildingByKey, buildingForRoom, buildingFromCode, EDGE_TOLERANCE_M } = require('../config/buildings');
const latestCode = { orderBy: { expiryTimestamp: 'desc' }, take: 1 };

/**
 * How long after the code closes the session stays open: the tutor's review time for
 * flagged students (REVIEW_MINUTES, default 3), and never less than the offline grace time.
 * Code 2 min + review 3 min = 5 min in total.
 */
const closeAfterMs = () => Math.max(env.reviewMinutes * 60_000, env.networkGraceSeconds * 1000);
/** When a session with this code is closed automatically. */
const closesAt = (code) => (code ? new Date(code.expiryTimestamp.getTime() + closeAfterMs()) : null);

/** Loads a session and checks this tutor teaches it. "Not found" hides other tutors' sessions. */
async function ownedSession(id, tutorId) {
  const se = await prisma.classSession.findUnique({ where: { id }, include: { section: { include: { module: true } }, codes: latestCode } });
  // the module's tutor, or the tutor who covered this class
  if (!se || (se.section.tutorId !== tutorId && se.takenBy !== tutorId)) throw NotFound('Session not found', 'SESSION_NOT_FOUND');
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
 *  • { slot } → a timetable class (from 15 minutes before it starts until it ends), or
 *  • { change } → an extra class, or a class this tutor was asked to cover, or
 *  • { module, type, hours, room } → the module's class happening now (a module that isn't on
 *    the timetable can be started any time), or
 *  • { sessionId } → re-opens an existing (scheduled/ongoing) session with a fresh code.
 * Outside class time the tutor books an extra class (classChange.service.js).
 * Geofence (b.mode):
 *  • 'building' → students must be inside that building's outline (config/buildings.js).
 *                 The code stores the building's anchor point + edge tolerance, so no DB change is needed.
 *  • 'workshop' → the tutor's current GPS is the centre and b.radius (metres) the circle.
 */
async function startSession(tutorId, b) {
  const minutes = b.minutes ?? env.codeValidityMinutes;
  // Which class this is (timetable class, extra class, cover) and whether it's class time.
  // Worked out first so the class's room can decide the building when the tutor didn't pick one.
  const plan = b.sessionId ? null : await planStart(tutorId, b);
  const room = b.room || plan?.room;
  // building chosen by the tutor, else the building the room is in (e.g. "ITL 06" → IT)
  const building = b.mode === 'building' ? (buildingByKey(b.building) || buildingForRoom(room)) : null;
  if (b.mode === 'building' && !building) throw BadRequest('Choose the building — that room is not in the building list.', 'BUILDING_INVALID');
  const radius = building ? EDGE_TOLERANCE_M : (b.radius ?? env.geofenceMetres);
  const centre = building ? building.anchor : { lat: b.lat, lng: b.lng };
  const now = new Date(), expiry = new Date(Date.now() + minutes * 60_000);
  const code = await uniqueCode();
  const codeData = { code, expiryTimestamp: expiry, geofenceRadius: radius, latitude: centre.lat, longitude: centre.lng };
  const where = locationOf(codeData);

  if (b.sessionId) {
    const se = await ownedSession(b.sessionId, tutorId);
    if (se.status === SESSION_STATUS.ENDED) throw Conflict('This session has already ended', 'SESSION_ENDED');
    const live = se.codes[0];
    if (se.status === SESSION_STATUS.ONGOING && live && live.expiryTimestamp > now) return { _id: se.id, code: live.code, expiresAt: live.expiryTimestamp, location: locationOf(live) };
    await prisma.$transaction([
      prisma.attendanceCode.create({ data: { sessionId: se.id, ...codeData } }),
      prisma.classSession.update({ where: { id: se.id }, data: { status: SESSION_STATUS.ONGOING } }),
    ]);
    return { _id: se.id, code, expiresAt: expiry, location: where };
  }

  if (room && !plan.takenBy) await prisma.section.updateMany({ where: { id: plan.sectionId, room: { not: room } }, data: { room } });
  const se = await prisma.classSession.create({
    data: {
      sectionId: plan.sectionId, date: now, startTime: now, duration: plan.minutes || Math.round(b.hours * 60), sessionType: plan.type || b.type,
      status: SESSION_STATUS.ONGOING, slotId: plan.slotId, changeId: plan.changeId, takenBy: plan.takenBy, counts: plan.counts,
      codes: { create: codeData },
    },
  });
  return { _id: se.id, code, expiresAt: expiry, closesAt: closesAt({ expiryTimestamp: expiry }), radius, minutes, optional: !plan.counts, location: where };
}

/** Readable geofence of an attendance code: { mode: 'building', building, name } or { mode: 'workshop', radius }. */
function locationOf(codeRow) {
  if (!codeRow) return null;
  const bld = buildingFromCode(codeRow);
  return bld ? { mode: 'building', building: bld.key, name: bld.name } : { mode: 'workshop', radius: codeRow.geofenceRadius };
}

/**
 * Ends a session and records every enrolled student who never checked in as Absent.
 * Flagged check-ins the tutor didn't decide in time also become Absent.
 * Safe to call twice: an ended session is left alone.
 */
async function finalizeSession(sessionId) {
  const se = await prisma.classSession.findUnique({ where: { id: sessionId }, include: { section: true } });
  if (!se || se.status === SESSION_STATUS.ENDED) return;
  const [enrolled, att] = await Promise.all([
    // students enrolled in this module in the session's own semester
    // active students only: someone who graduated or left is not marked absent in new classes
    prisma.enrollment.findMany({ where: { moduleId: se.section.moduleId, academicSession: se.section.academicSession, student: { isActive: true } }, select: { studentId: true } }),
    prisma.attendance.findMany({ where: { sessionId }, select: { studentId: true } }),
  ]);
  const checkedIn = new Set(att.map((a) => a.studentId));
  // An optional class records only who came: nobody is marked absent for skipping it
  const missing = se.counts === false ? [] : enrolled.filter((e) => !checkedIn.has(e.studentId));
  await prisma.$transaction([
    // never checked in → Absent
    prisma.attendance.createMany({ data: missing.map((e) => ({ studentId: e.studentId, sessionId, status: 'Absent' })), skipDuplicates: true }),
    // CHANGED: flagged but the tutor didn't decide before the time ran out → Absent
    prisma.attendance.updateMany({
      where: { sessionId, status: { in: ['Flagged', 'Pending review'] } },
      data: { status: 'Absent', flagReason: 'not_decided_in_time' },
    }),
    prisma.classSession.update({ where: { id: sessionId }, data: { status: SESSION_STATUS.ENDED } }),
  ]);
}

/**
 * Closes every ongoing session whose code has run out AND whose review time is over
 * (code + REVIEW_MINUTES).
 * server.js runs this every minute, so absences are recorded even if the tutor closes the page.
 */
async function sweepExpiredSessions() {
  const cutoff = new Date(Date.now() - closeAfterMs());
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
  const reviewOver = c && closesAt(c) <= new Date();
  if (status === SESSION_STATUS.ONGOING && reviewOver) { await finalizeSession(se.id); status = SESSION_STATUS.ENDED; }

  const total = await prisma.enrollment.count({ where: { moduleId: se.section.moduleId, academicSession: se.section.academicSession, student: { isActive: true } } });
  const list = await prisma.attendance.findMany({ where: { sessionId: se.id }, include: { student: true } });
  const present = list.filter((a) => ATTENDED.includes(a.status)).length;
  const flagged = list.filter((a) => apiStatus(a.status) === 'flagged');
  return {
    code: c?.code ?? null, expiresAt: c?.expiryTimestamp ?? null, closesAt: closesAt(c), status, total, optional: !se.counts, location: locationOf(c),
    checkedIn: present,
    absent: Math.max(0, total - present - flagged.length),
    flagged: flagged.map((a) => ({ id: a.id, attendanceId: a.id, name: a.student.name, flagReason: a.flagReason, reason: flagText(a.flagReason) })),
  };
}

/** The tutor's class sessions in one semester (current by default, or ?session=AS2026). */
async function listMine(tutorId, { limit, status, session }) {
  const academicSession = await sessionOrCurrent(session);
  const rows = await prisma.classSession.findMany({
    // their own modules' sessions, plus classes they covered for another tutor
    where: { OR: [{ section: { tutorId, academicSession } }, { takenBy: tutorId, section: { academicSession } }], ...(status && { status }) },
    include: { section: { include: { module: true } }, taker: { select: { name: true } }, _count: { select: { attendance: true } } },
    orderBy: [{ date: 'desc' }, { startTime: 'desc' }], take: limit,
  });
  return rows.map((x) => ({
    _id: x.id, module: { id: x.section.moduleId, code: x.section.module.code, name: x.section.module.name },
    section: x.section.name, room: x.section.room, date: sessionStart(x), hours: x.duration / 60, type: x.sessionType, status: x.status, checkIns: x._count.attendance,
    optional: !x.counts, extra: !!x.changeId && !x.slotId, coveredBy: x.taker?.name ?? null,
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
    prisma.enrollment.findMany({ where: { moduleId: se.section.moduleId, academicSession: se.section.academicSession, student: { isActive: true } }, include: { student: true }, orderBy: { studentId: 'asc' } }),
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
      status: se.status, code: c?.code ?? null, expiresAt: c?.expiryTimestamp ?? null, radius: c?.geofenceRadius ?? null, optional: !se.counts,
      location: locationOf(c),
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
  const enrolled = await prisma.enrollment.findUnique({
    where: { studentId_moduleId_academicSession: { studentId, moduleId: se.section.moduleId, academicSession: se.section.academicSession } },
  });
  if (!enrolled) throw BadRequest('That student is not enrolled in this module', 'NOT_ENROLLED');
  const status = present ? 'Present' : 'Absent', flagReason = 'marked_by_tutor';
  await prisma.attendance.upsert({
    where: { studentId_sessionId: { studentId, sessionId: se.id } },
    update: { status, flagReason }, create: { studentId, sessionId: se.id, status, flagReason },
  });
  return { userId: studentId, status: present ? 'present' : 'absent' };
}

module.exports = { locationOf, ownedSession, startSession, finalizeSession, sweepExpiredSessions, live, listMine, endSession, roster, decideFlagged, markManually };