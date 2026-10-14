// ─────────────────────────────────────────────────────────────
// The core feature: a student checks in with the code + GPS.
//
//  1. code exists and hasn't expired (an "offline" check-in held back by
//     bad internet is still accepted up to NETWORK_GRACE_SECONDS late)
//  2. session not ended
//  3. student is enrolled in the module
//  4. not already checked in
//  5. location:
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

async function checkIn(student, { code, lat, lng, accuracy, permissionDenied, locationError, offline }) {
  const c = normalizeCode(code);
  if (!isValidCodeFormat(c)) throw BadRequest('That code doesn’t look right. Check it and try again.', 'CODE_INVALID');

  const now = new Date();
  const row = await prisma.attendanceCode.findFirst({
    where: { code: c }, orderBy: { expiryTimestamp: 'desc' },
    include: { session: { include: { section: { include: { module: true } } } } },
  });
  if (!row) throw BadRequest('That code is not valid. Ask your tutor to confirm it.', 'CODE_INVALID');
  if (row.session.status === SESSION_STATUS.ENDED) throw BadRequest('This session has ended', 'SESSION_ENDED');
  const graceEnd = row.expiryTimestamp.getTime() + env.networkGraceSeconds * 1000;
  if (row.expiryTimestamp <= now && !(offline && now.getTime() < graceEnd)) throw BadRequest('This code has expired', 'CODE_EXPIRED');
  const late = row.expiryTimestamp <= now; // only possible when offline = true

  const sec = row.session.section, m = sec.module;
  const enrolled = await prisma.enrollment.findUnique({ where: { studentId_moduleId: { studentId: student.id, moduleId: m.id } } });
  if (!enrolled) throw Forbidden('You are not enrolled in this module', 'NOT_ENROLLED');

  // ── decide present vs flagged vs refused
  let flagReason = null, distance = null;
  const noLocation = lat === undefined || lng === undefined;
  if (permissionDenied) flagReason = FLAG_REASONS.PERMISSION;
  else if (locationError) flagReason = FLAG_REASONS.LOCATION;
  else if (noLocation) flagReason = FLAG_REASONS.PERMISSION;
  else {
    distance = round1(haversineMeters({ lat, lng }, { lat: row.latitude, lng: row.longitude }));
    if (distance > row.geofenceRadius) {
      const couldBeInside = accuracy !== undefined && distance - accuracy <= row.geofenceRadius;
      if (!couldBeInside) {
        // Right code, but clearly not in the classroom: refuse. Nothing is saved, so they can
        // move into the room and try again; if they don't, the session sweep marks them Absent.
        throw BadRequest(
          `You are not in the classroom area (about ${Math.round(distance)} m away). Move into the classroom and try again.`,
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

module.exports = { checkIn };