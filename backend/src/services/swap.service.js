// ─────────────────────────────────────────────────────────────
// Swapping classes between two tutors (database.sql Part 16).
//
// Tutor A picks one of their timetable classes and one of tutor B's, and asks B to swap.
// The two classes exchange TIME and ROOM; each keeps its own module, tutor and students:
//
//   before   Mon 9:00 AM  SWE303 (A) IT-02      Mon 11:15 AM CTE202 (B) IT-05
//   after    Mon 9:00 AM  CTE202 (B) IT-02      Mon 11:15 AM SWE303 (A) IT-05
//
// Nothing changes until B accepts (in the app: Timetable → Swap requests; B also gets a
// bell notification — tutors aren't emailed, their addresses aren't real yet).
// On accept, in one transaction: both timetable classes are cancelled for their dates and
// each module gets an extra class at the other's time and room (class_changes, reason
// "Swapped with another tutor"). Both groups of students get a bell + email saying when
// and where to come. Undo = each tutor calls off their extra class and undoes the cancellation.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { BadRequest, NotFound, Forbidden, Conflict } = require('../utils/errors');
const { currentAcademicSession } = require('../lib/academicSession');
const { notify } = require('./notifications.service');
const cc = require('./classChange.service');

const {
  loadDay, sectionsNow, teaches, changeOut, include, tellStudents, checkDate, blocking,
  dateOf, hhmm, ymd, nice, span12, dowOf, DAY,
} = cc.internal;
const { REASONS, todayStr, nowHHMM } = cc;

const slotInclude = { module: true, room: true };

/** A timetable class on one date, as shown in the app. */
const classOut = (slot, date) => ({
  slotId: slot.id, date, day: DAY[dowOf(date)], start: hhmm(slot.startTime), end: hhmm(slot.endTime),
  module: { id: slot.moduleId, code: slot.module?.code, name: slot.module?.name },
  room: slot.room ? { id: slot.room.id, name: slot.room.name } : null, sessionType: slot.sessionType,
});
const label = (x) => `${x.module.code} on ${nice(x.date)}, ${span12(x.start, x.end)}${x.room ? ` (${x.room.name})` : ''}`;

/** Is this timetable class still free to swap on that date? Throws a clear message if not. */
async function checkSwappable(slot, date, whose) {
  if (dowOf(date) !== slot.dayOfWeek) throw BadRequest(`${whose} class is on ${DAY[slot.dayOfWeek]}s. Choose a ${DAY[slot.dayOfWeek]}.`, 'WRONG_DAY');
  if (date === todayStr() && hhmm(slot.startTime) <= nowHHMM()) throw BadRequest(`${whose} class has already started, so it can't be swapped.`, 'PAST_TIME');
  const [taken, changed] = await Promise.all([
    prisma.classSession.findFirst({ where: { slotId: slot.id, date: dateOf(date) }, select: { id: true } }),
    prisma.classChange.findFirst({ where: { slotId: slot.id, date: dateOf(date) }, select: { type: true } }),
  ]);
  if (taken) throw Conflict(`Attendance was already taken for ${whose === 'Your' ? 'your' : 'that'} class.`, 'ALREADY_TAKEN');
  if (changed) throw Conflict(`${whose} class is already ${changed.type === 'cancelled' ? 'cancelled' : 'covered'} that day.`, 'ALREADY_CHANGED');
}

/**
 * Would the swap clash with anything? Module X moves to the other class's time and room;
 * both classes being swapped are ignored (they move away). Returns the blocking reasons.
 */
async function swapClashes(term, a, b, tutorA, tutorB) {
  const out = [];
  for (const [mine, other, tutor] of [[a, b, tutorA], [b, a, tutorB]]) {
    const day = await loadDay(term, other.date, mine.module.id);
    const list = cc.clashes(day, {
      start: other.start, end: other.end, roomId: other.room?.id, tutorId: tutor, moduleId: mine.module.id,
      ignore: [a.slotId, b.slotId], self: tutor,
    });
    out.push(...blocking(list, true).map((c) => `${mine.module.code} at ${span12(other.start, other.end)}: ${c.text}`));
  }
  return out;
}

async function loadPair(fromSlotId, fromDate, toSlotId, toDate) {
  const [s1, s2] = await Promise.all([
    prisma.timetableSlot.findUnique({ where: { id: fromSlotId }, include: slotInclude }),
    prisma.timetableSlot.findUnique({ where: { id: toSlotId }, include: slotInclude }),
  ]);
  if (!s1?.moduleId || !s2?.moduleId) throw NotFound('Timetable class not found', 'SLOT_NOT_FOUND');
  return [classOut(s1, fromDate), classOut(s2, toDate), s1, s2];
}

/** B's timetable classes on a date that A could swap with (for the Swap form). */
async function optionsFor(tutorId, { tutor, date }) {
  const term = await currentAcademicSession();
  await checkDate(term, date);
  const secs = await sectionsNow(term);
  const [slots, changes, sessions] = await Promise.all([
    prisma.timetableSlot.findMany({ where: { academicSession: term, dayOfWeek: dowOf(date) }, include: slotInclude, orderBy: { startTime: 'asc' } }),
    prisma.classChange.findMany({ where: { academicSession: term, date: dateOf(date), slotId: { not: null } }, select: { slotId: true } }),
    prisma.classSession.findMany({ where: { date: dateOf(date), slotId: { not: null } }, select: { slotId: true } }),
  ]);
  const used = new Set([...changes, ...sessions].map((x) => x.slotId));
  const now = date === todayStr() ? nowHHMM() : null;
  return slots
    .filter((s) => s.moduleId && teaches(secs, tutor, s.moduleId) && !used.has(s.id) && !(now && hhmm(s.startTime) <= now))
    .map((s) => classOut(s, date));
}

/** Tutor A asks tutor B to swap. body: { slot, date, withTutor, withSlot, withDate, note } */
async function request(tutorId, b) {
  const term = await currentAcademicSession();
  await Promise.all([checkDate(term, b.date), checkDate(term, b.withDate)]);
  if (b.withTutor === tutorId) throw BadRequest('Choose another tutor.', 'BAD_SWAP');
  const other = await prisma.user.findUnique({ where: { id: b.withTutor }, select: { id: true, name: true, role: true, isActive: true } });
  if (!other || other.role !== 'tutor' || !other.isActive) throw BadRequest('Choose an active tutor.', 'BAD_SWAP');

  const secs = await sectionsNow(term);
  const [mine, theirs, s1, s2] = await loadPair(b.slot, b.date, b.withSlot, b.withDate);
  if (!teaches(secs, tutorId, s1.moduleId)) throw Forbidden('You can only swap classes of modules you teach.', 'NOT_YOUR_MODULE');
  if (!teaches(secs, other.id, s2.moduleId)) throw BadRequest(`${other.name} doesn't teach ${theirs.module.code}.`, 'BAD_SWAP');
  if (s1.id === s2.id && b.date === b.withDate) throw BadRequest('Choose two different classes.', 'BAD_SWAP');
  await checkSwappable(s1, b.date, 'Your');
  await checkSwappable(s2, b.withDate, 'Their');

  const open = await prisma.swapRequest.findFirst({
    where: { status: 'pending', OR: [
      { fromSlotId: s1.id, fromDate: dateOf(b.date) }, { toSlotId: s1.id, toDate: dateOf(b.date) },
      { fromSlotId: s2.id, fromDate: dateOf(b.withDate) }, { toSlotId: s2.id, toDate: dateOf(b.withDate) },
    ] },
  });
  if (open) throw Conflict('One of these classes already has a swap request waiting for an answer.', 'SWAP_PENDING');

  const stop = await swapClashes(term, mine, theirs, tutorId, other.id);
  if (stop.length) throw Conflict(`Can't swap these classes. ${stop.join(' ')}`, 'CLASH');

  const me = await prisma.user.findUnique({ where: { id: tutorId }, select: { name: true } });
  const sw = await prisma.swapRequest.create({
    data: {
      fromTutorId: tutorId, toTutorId: other.id, fromSlotId: s1.id, fromDate: dateOf(b.date),
      toSlotId: s2.id, toDate: dateOf(b.withDate), note: b.note || null,
    },
  });
  await notify(other.id,
    `${me?.name || 'A tutor'} wants to swap classes: your ${label(theirs)} with their ${label(mine)}. ` +
    `Open your Timetable → Swap requests to accept or reject.${b.note ? ` Note: ${b.note}` : ''}`, 'Reminders');
  return { id: sw.id, status: sw.status, mine, theirs, with: { id: other.id, name: other.name } };
}

async function out(sw) {
  const [mine, theirs] = await loadPair(sw.fromSlotId, ymd(sw.fromDate), sw.toSlotId, ymd(sw.toDate));
  const expired = sw.status === 'pending' && (
    ymd(sw.fromDate) + mine.start <= todayStr() + nowHHMM() || ymd(sw.toDate) + theirs.start <= todayStr() + nowHHMM());
  return {
    id: sw.id, status: expired ? 'expired' : sw.status, note: sw.note, createdAt: sw.createdAt, decidedAt: sw.decidedAt,
    from: { id: sw.fromTutorId, name: sw.fromTutor?.name, class: mine },
    to: { id: sw.toTutorId, name: sw.toTutor?.name, class: theirs },
  };
}

/** Swap requests for a tutor: incoming and outgoing, pending first, then the last 14 days. */
async function list(tutorId) {
  const since = new Date(Date.now() - 14 * 86400000);
  const rows = await prisma.swapRequest.findMany({
    where: { OR: [{ fromTutorId: tutorId }, { toTutorId: tutorId }], AND: [{ OR: [{ status: 'pending' }, { createdAt: { gte: since } }] }] },
    include: { fromTutor: { select: { name: true } }, toTutor: { select: { name: true } } },
    orderBy: { createdAt: 'desc' }, take: 30,
  });
  const all = await Promise.all(rows.map(out));
  return { incoming: all.filter((s) => s.to.id === tutorId), outgoing: all.filter((s) => s.from.id === tutorId) };
}

async function pendingFor(id) {
  const sw = await prisma.swapRequest.findUnique({ where: { id }, include: { fromTutor: { select: { name: true } }, toTutor: { select: { name: true } } } });
  if (!sw) throw NotFound('Swap request not found', 'SWAP_NOT_FOUND');
  if (sw.status !== 'pending') throw Conflict(`This swap request was already ${sw.status}.`, 'SWAP_DONE');
  return sw;
}

/** Tutor B accepts: the two classes exchange time and room. */
async function accept(tutorId, id) {
  const sw = await pendingFor(id);
  if (sw.toTutorId !== tutorId) throw Forbidden('Only the tutor who was asked can accept this swap.', 'NOT_YOURS');
  const term = await currentAcademicSession();
  const [a, b, s1, s2] = await loadPair(sw.fromSlotId, ymd(sw.fromDate), sw.toSlotId, ymd(sw.toDate));
  await checkSwappable(s1, a.date, `${sw.fromTutor?.name || 'Their'}'s`);
  await checkSwappable(s2, b.date, 'Your');
  const stop = await swapClashes(term, a, b, sw.fromTutorId, sw.toTutorId);
  if (stop.length) throw Conflict(`Can't swap any more. ${stop.join(' ')}`, 'CLASH');

  const reason = `${REASONS.swap} (${sw.fromTutor?.name} ↔ ${sw.toTutor?.name})`.slice(0, 200);
  const cancel = (x, slot, by) => ({
    type: 'cancelled', date: dateOf(x.date), slotId: slot.id, moduleId: slot.moduleId, roomId: slot.roomId,
    startTime: slot.startTime, endTime: slot.endTime, sessionType: slot.sessionType || 'theory', counts: true, reason, academicSession: term, createdBy: by,
  });
  // module of `x` taught at the time and room of `at`
  const moved = (x, slotX, at, slotAt, by) => ({
    type: 'extra', date: dateOf(at.date), slotId: null, moduleId: slotX.moduleId, roomId: slotAt.roomId,
    startTime: slotAt.startTime, endTime: slotAt.endTime, sessionType: slotX.sessionType || 'theory', counts: true, reason, academicSession: term, createdBy: by,
  });
  const [, , extraA, extraB] = await prisma.$transaction([
    prisma.classChange.create({ data: cancel(a, s1, sw.fromTutorId) }),
    prisma.classChange.create({ data: cancel(b, s2, sw.toTutorId) }),
    prisma.classChange.create({ data: moved(a, s1, b, s2, sw.fromTutorId), include }),
    prisma.classChange.create({ data: moved(b, s2, a, s1, sw.toTutorId), include }),
    prisma.swapRequest.update({ where: { id }, data: { status: 'accepted', decidedAt: new Date() } }),
  ]);
  const na = changeOut(extraA), nb = changeOut(extraB);
  const where = (x) => (x.room ? ` in ${x.room.name}` : '');
  await tellStudents(a.module.id, term,
    `Class moved: ${a.module.code} – ${a.module.name} on ${nice(a.date)} is no longer at ${span12(a.start, a.end)}. ` +
    `Please come on ${nice(na.date)}, ${span12(na.start, na.end)}${where(na)} instead.`, `Class moved: ${a.module.code}`);
  await tellStudents(b.module.id, term,
    `Class moved: ${b.module.code} – ${b.module.name} on ${nice(b.date)} is no longer at ${span12(b.start, b.end)}. ` +
    `Please come on ${nice(nb.date)}, ${span12(nb.start, nb.end)}${where(nb)} instead.`, `Class moved: ${b.module.code}`);
  await notify(sw.fromTutorId,
    `${sw.toTutor?.name || 'The tutor'} accepted your swap. You now teach ${a.module.code} on ${nice(na.date)}, ${span12(na.start, na.end)}${where(na)}. Students have been told.`, 'Reminders');
  return { id, status: 'accepted', yourClass: nb, theirClass: na };
}

/** Tutor B rejects. */
async function reject(tutorId, id) {
  const sw = await pendingFor(id);
  if (sw.toTutorId !== tutorId) throw Forbidden('Only the tutor who was asked can reject this swap.', 'NOT_YOURS');
  await prisma.swapRequest.update({ where: { id }, data: { status: 'rejected', decidedAt: new Date() } });
  const [a, b] = await loadPair(sw.fromSlotId, ymd(sw.fromDate), sw.toSlotId, ymd(sw.toDate));
  await notify(sw.fromTutorId, `${sw.toTutor?.name || 'The tutor'} rejected your swap of ${label(a)} with ${label(b)}. Nothing has changed.`, 'Reminders');
  return { id, status: 'rejected' };
}

/** Tutor A takes the request back before B answers. */
async function cancel(tutorId, id) {
  const sw = await pendingFor(id);
  if (sw.fromTutorId !== tutorId) throw Forbidden('Only the tutor who asked can cancel this swap request.', 'NOT_YOURS');
  await prisma.swapRequest.update({ where: { id }, data: { status: 'cancelled', decidedAt: new Date() } });
  await notify(sw.toTutorId, `${sw.fromTutor?.name || 'A tutor'} cancelled their swap request.`, 'Reminders');
  return { id, status: 'cancelled' };
}

module.exports = { optionsFor, request, list, accept, reject, cancel };
