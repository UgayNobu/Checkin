// ─────────────────────────────────────────────────────────────
// The core feature: a student checks in with the code + GPS.
//
//  1. code exists and hasn't expired (an "offline" check-in held back by
//     bad internet is still accepted up to NETWORK_GRACE_SECONDS late)
//  2. session not ended
//  3. student is enrolled in the module
//  4. not already checked in
//  5. location — the geofence is either a building outline (polygon, see config/buildings.js)
//     or the tutor's workshop circle (tutor GPS + radius):
//       clearly outside the geofence      → REFUSED ("not in the classroom area").
//                                           Nothing is saved; if they don't check in
//                                           properly before the code expires, the
//                                           end-of-session sweep marks them Absent.
//       location permission denied        → Flagged (permission_denied)
//       browser could not get a location  → Flagged (location_error)
//       outside, but the GPS error margin
//         could put them inside           → Flagged (low_accuracy)
//       GPS accuracy worse than 50 m      → Flagged (low_accuracy)
//       arrived after expiry (offline)    → Flagged (network_issue)
//       otherwise                         → Present
// Flagged check-ins don't count until the tutor accepts them.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { env } = require('../config/env');
const { FLAG_REASONS, SESSION_STATUS } = require('../config/constants');
const { haversineMeters } = require('../utils/haversine');
const { normalizeCode, isValidCodeFormat } = require('../utils/code');
const { round1, flagText } = require('../utils/format');
const { BadRequest, Forbidden, Conflict } = require('../utils/errors');
const { notify } = require('./notifications.service');
const { buildingFromCode, publicBuildings } = require('../config/buildings');
const { locateInBuilding } = require('../utils/geofence');
const { locationOf } = require('./session.service');

async function checkIn(student, { code, sessionId, lat, lng, accuracy, permissionDenied, locationError, offline }) {
  const c = normalizeCode(code);
  if (!isValidCodeFormat(c)) throw BadRequest('That code doesn’t look right. Check it and try again.', 'CODE_INVALID');

  const now = new Date();
  const row = await prisma.attendanceCode.findFirst({
    where: { code: c }, orderBy: { expiryTimestamp: 'desc' },
    include: { session: { include: { section: { include: { module: true } } } } },
  });
  if (!row) throw BadRequest('That code is not valid. Ask your tutor to confirm it.', 'CODE_INVALID');
  // The student picked a class on the building card first: the code must belong to that class.
  if (sessionId && row.sessionId !== sessionId) throw BadRequest('That code is not for the class you selected.', 'CODE_WRONG_CLASS');
  if (row.session.status === SESSION_STATUS.ENDED) throw BadRequest('This session has ended', 'SESSION_ENDED');
  const graceEnd = row.expiryTimestamp.getTime() + env.networkGraceSeconds * 1000;
  if (row.expiryTimestamp <= now && !(offline && now.getTime() < graceEnd)) throw BadRequest('This code has expired', 'CODE_EXPIRED');
  const late = row.expiryTimestamp <= now; // only possible when offline = true

  const sec = row.session.section, m = sec.module;
  const enrolled = await prisma.enrollment.findUnique({
    where: { studentId_moduleId_academicSession: { studentId: student.id, moduleId: m.id, academicSession: sec.academicSession } },
  });
  if (!enrolled) throw Forbidden('You are not enrolled in this module', 'NOT_ENROLLED');

  // ── decide present vs flagged vs refused
  let flagReason = null, distance = null;
  const noLocation = lat === undefined || lng === undefined;
  if (permissionDenied) flagReason = FLAG_REASONS.PERMISSION;
  else if (locationError) flagReason = FLAG_REASONS.LOCATION;
  else if (noLocation) flagReason = FLAG_REASONS.PERMISSION;
  else {
    // building session: distance = metres outside the building's walls (0 inside)
    // workshop session: distance = metres from the tutor's position
    const building = buildingFromCode(row);
    distance = round1(building
      ? locateInBuilding({ lat, lng }, building).outsideBy
      : haversineMeters({ lat, lng }, { lat: row.latitude, lng: row.longitude }));
    if (distance > row.geofenceRadius) {
      const couldBeInside = accuracy !== undefined && distance - accuracy <= row.geofenceRadius;
      if (!couldBeInside) {
        // Right code, but clearly not in the classroom: refuse. Nothing is saved, so they can
        // move into the room and try again; if they don't, the session sweep marks them Absent.
        throw BadRequest(
          building
            ? `You are not inside the ${building.name} (about ${Math.round(distance)} m outside it). Go to your class and try again.`
            : `You are not in the workshop area (about ${Math.round(distance)} m from your tutor). Move closer and try again.`,
          'OUTSIDE_RADIUS'
        );
      }
      flagReason = FLAG_REASONS.ACCURACY; // GPS problem, not definitely outside
    } else if (accuracy !== undefined && accuracy > env.accuracyFlagMetres) flagReason = FLAG_REASONS.ACCURACY;
  }
  if (!flagReason && late) flagReason = FLAG_REASONS.NETWORK;
  const ok = !flagReason;

  try {
    await prisma.attendance.create({
      data: {
        studentId: student.id, sessionId: row.sessionId, status: ok ? 'Present' : 'Flagged', flagReason, distanceMeters: distance,
        submittedLat: distance === null ? null : lat, submittedLng: distance === null ? null : lng, accuracy: accuracy ?? null,
      },
    });
  } catch (e) {
    // The unique (student, session) constraint also catches double-taps that arrive at the same moment.
    if (e.code === 'P2002') throw Conflict('You have already checked in to this session', 'ALREADY_CHECKED_IN');
    throw e;
  }

  if (!ok) {
    const why = {
      [FLAG_REASONS.ACCURACY]: `with weak GPS accuracy (${accuracy === undefined ? '?' : Math.round(accuracy)} m)`,
      [FLAG_REASONS.PERMISSION]: 'without sharing location',
      [FLAG_REASONS.LOCATION]: 'but their browser could not get a location',
      [FLAG_REASONS.NETWORK]: 'after the code expired (poor internet connection)',
    }[flagReason];
    await notify(sec.tutorId, `${student.name} checked in ${why} (${m.code}). Please verify.`, 'Attendance');
  }

  return {
    status: ok ? 'present' : 'flagged', flagReason, reason: flagText(flagReason), distance,
    module: { code: m.code, name: m.name },
    // CHANGED: a flagged student is told to tell the teacher before the timer ends
    message: ok
      ? `Present in ${m.name}`
      : 'Your check-in is flagged (your location could not be confirmed). Tell your teacher now so they can mark you present before the timer ends.',
  };
}

/**
 * Classes the student can check in to right now (enrolled, session ongoing, code not expired),
 * grouped by the 5 cards on the attendance page. The code itself is never sent.
 */
async function liveClasses(student) {
  const now = new Date();
  const sessions = await prisma.classSession.findMany({
    where: {
      status: SESSION_STATUS.ONGOING,
      codes: { some: { expiryTimestamp: { gt: now } } },
      section: { module: { enrollments: { some: { studentId: student.id } } } },
      attendance: { none: { studentId: student.id } }, // already checked in → hide it
    },
    include: {
      section: { include: { module: true, tutor: { select: { name: true } } } },
      taker: { select: { name: true } },
      codes: { orderBy: { expiryTimestamp: 'desc' }, take: 1 },
    },
  });
  // enrolment must be in the section's own semester
  const enrolled = await prisma.enrollment.findMany({ where: { studentId: student.id }, select: { moduleId: true, academicSession: true } });
  const ok = new Set(enrolled.map((e) => `${e.moduleId}|${e.academicSession}`));
  const classes = sessions
    .filter((se) => ok.has(`${se.section.moduleId}|${se.section.academicSession}`))
    .map((se) => ({
      sessionId: se.id,
      module: { code: se.section.module.code, name: se.section.module.name },
      type: se.sessionType, room: se.section.room,
      tutor: se.taker?.name || se.section.tutor?.name || null,
      expiresAt: se.codes[0].expiryTimestamp,
      location: locationOf(se.codes[0]),
    }));
  return { buildings: publicBuildings(), classes };
}

module.exports = { checkIn, liveClasses };