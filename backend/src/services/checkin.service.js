// ─────────────────────────────────────────────────────────────
// The core feature: a student checks in with the code + GPS.
//
//  1. code exists and hasn't expired
//  2. session not ended
//  3. student is enrolled in the module
//  4. not already checked in
//  5. location:
//       no location shared           → Flagged (permission_denied)
//       distance > geofence radius    → Flagged (outside_radius)
//       GPS accuracy worse than 50 m  → Flagged (low_accuracy)
//       otherwise                     → Present
// Flagged check-ins don't count until the tutor accepts them.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { env } = require('../config/env');
const { FLAG_REASONS, SESSION_STATUS } = require('../config/constants');
const { haversineMeters } = require('../utils/haversine');
const { normalizeCode, isValidCodeFormat } = require('../utils/code');
const { round1 } = require('../utils/format');
const { BadRequest, Forbidden, Conflict } = require('../utils/errors');
const { notify } = require('./notifications.service');

async function checkIn(student, { code, lat, lng, accuracy, permissionDenied }) {
  const c = normalizeCode(code);
  if (!isValidCodeFormat(c)) throw BadRequest('That code doesn’t look right. Check it and try again.', 'CODE_INVALID');

  const row = await prisma.attendanceCode.findFirst({
    where: { code: c }, orderBy: { expiryTimestamp: 'desc' },
    include: { session: { include: { section: { include: { module: true } } } } },
  });
  if (!row) throw BadRequest('That code is not valid. Ask your tutor to confirm it.', 'CODE_INVALID');
  if (row.session.status === SESSION_STATUS.ENDED) throw BadRequest('This session has ended', 'SESSION_ENDED');
  if (row.expiryTimestamp <= new Date()) throw BadRequest('This code has expired', 'CODE_EXPIRED');

  const sec = row.session.section, m = sec.module;
  const enrolled = await prisma.enrollment.findUnique({ where: { studentId_moduleId: { studentId: student.id, moduleId: m.id } } });
  if (!enrolled) throw Forbidden('You are not enrolled in this module', 'NOT_ENROLLED');

  // ── decide present vs flagged
  let flagReason = null, distance = null;
  const noLocation = permissionDenied || lat === undefined || lng === undefined;
  if (noLocation) flagReason = FLAG_REASONS.PERMISSION;
  else {
    distance = round1(haversineMeters({ lat, lng }, { lat: row.latitude, lng: row.longitude }));
    if (distance > row.geofenceRadius) flagReason = FLAG_REASONS.OUTSIDE;
    else if (accuracy !== undefined && accuracy > env.accuracyFlagMetres) flagReason = FLAG_REASONS.ACCURACY;
  }
  const ok = !flagReason;

  try {
    await prisma.attendance.create({
      data: {
        studentId: student.id, sessionId: row.sessionId, status: ok ? 'Present' : 'Flagged', flagReason, distanceMeters: distance,
        submittedLat: noLocation ? null : lat, submittedLng: noLocation ? null : lng, accuracy: accuracy ?? null,
      },
    });
  } catch (e) {
    // The unique (student, session) constraint also catches double-taps that arrive at the same moment.
    if (e.code === 'P2002') throw Conflict('You have already checked in to this session', 'ALREADY_CHECKED_IN');
    throw e;
  }

  if (!ok) {
    const why = flagReason === FLAG_REASONS.OUTSIDE ? `${Math.round(distance)} m from the classroom`
      : flagReason === FLAG_REASONS.ACCURACY ? `with weak GPS accuracy (${Math.round(accuracy)} m)` : 'without sharing location';
    await notify(sec.tutorId, `${student.name} checked in ${why} (${m.code}). Please verify.`, 'Attendance');
  }

  return {
    status: ok ? 'present' : 'flagged', flagReason, distance,
    module: { code: m.code, name: m.name },
    message: ok ? `Present in ${m.name}` : 'Checked in, but your location could not be confirmed. Your tutor will review it.',
  };
}

module.exports = { checkIn };
