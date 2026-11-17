// ─────────────────────────────────────────────────────────────
// Swapping classes between two tutors (database.sql Part 16).
//
// Tutor A picks one of their classes and one of tutor B's, and asks B to swap.
// A class is either a timetable class on a date, or a booked extra class.
// The two classes exchange DATE, TIME and ROOM; each keeps its own module, tutor and students:
//
//   before   Mon 9:00 AM  SWE303 (A) IT-02      Mon 11:15 AM CTE202 (B) IT-05
//   after    Mon 9:00 AM  CTE202 (B) IT-02      Mon 11:15 AM SWE303 (A) IT-05
//
// Nothing changes until B accepts (Timetable → Swap requests; B also gets a bell
// notification — tutors aren't emailed, their addresses aren't real yet).
// On accept, in one transaction:
//   timetable class → cancelled for its date, and its module gets an extra class at the
//                     other side's date, time and room (reason "Swapped with another tutor")
//   extra class     → simply moved to the other side's date, time and room
// Both groups of students get a bell + email saying when and where to come.
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
const changeInclude = { module: true, room: true };

// ── one side of a swap ───────────────────────────────────────
/** A timetable class on a date, or an extra class, as { ref, cls } (cls = what the app shows). */
const fromSlot = (slot, date) => ({
  ref: { slotId: slot.id, date }, row: slot, kind: 'slot',
  cls: {
    kind: 'slot', slotId: slot.id, changeId: null, date, day: DAY[dowOf(date)], start: hhmm(slot.startTime), end: hhmm(slot.endTime),
    module: { id: slot.moduleId, code: slot.module?.code, name: slot.module?.name },
    room: slot.room ? { id: slot.room.id, name: slot.room.name } : null, sessionType: slot.sessionType,
  },
});
const fromChange = (c) => {
  const date = ymd(c.date);
  return {
    ref: { changeId: c.id }, row: c, kind: 'extra',
    cls: {
      kind: 'extra', slotId: null, changeId: c.id, date, day: DAY[dowOf(date)], start: hhmm(c.startTime), end: hhmm(c.endTime),
      module: { id: c.moduleId, code: c.module?.code, name: c.module?.name },
      room: c.room ? { id: c.room.id, name: c.room.name } : null, sessionType: c.sessionType, counts: c.counts,
    },
  };
};
const label = (x) => `${x.module.code} on ${nice(x.date)}, ${span12(x.start, x.end)}${x.room ? ` (${x.room.name})` : ''}`;

/** Load a side from { slotId, date } or { changeId }. */
async function loadSide({ slotId, date, changeId }) {
  if (changeId) {
    const c = await prisma.classChange.findUnique({ where: { id: changeId }, include: changeInclude });
    if (!c || c.type !== 'extra') throw NotFound('Extra class not found', 'CHANGE_NOT_FOUND');
    return fromChange(c);
  }
  const slot = await prisma.timetableSlot.findUnique({ where: { id: slotId }, include: slotInclude });
  if (!slot?.moduleId) throw NotFound('Timetable class not found', 'SLOT_NOT_FOUND');
  return fromSlot(slot, date);
}
const sideOfRow = (sw, which) => (which === 'from'
  ? { slotId: sw.fromSlotId, date: sw.fromDate && ymd(sw.fromDate), changeId: sw.fromChangeId }
  : { slotId: sw.toSlotId, date: sw.toDate && ymd(sw.toDate), changeId: sw.toChangeId });

/** Can this class still be swapped? Throws a clear message if not. whose = 'Your' | 'Their'. */
async function checkSwappable(side, whose) {
  const { cls } = side;
  const lower = whose === 'Your' ? 'your' : 'that';
  if (side.kind === 'slot' && dowOf(cls.date) !== side.row.dayOfWeek) {
    throw BadRequest(`${whose} class is on ${DAY[side.row.dayOfWeek]}s. Choose a ${DAY[side.row.dayOfWeek]}.`, 'WRONG_DAY');
  }
  if (cls.date < todayStr() || (cls.date === todayStr() && cls.start <= nowHHMM())) {
    throw BadRequest(`${whose} class has already started, so it can't be swapped.`, 'PAST_TIME');
  }
  if (side.kind === 'extra') {
    if (await prisma.classSession.findFirst({ where: { changeId: cls.changeId }, select: { id: true } })) throw Conflict(`Attendance was already taken for ${lower} class.`, 'ALREADY_TAKEN');
    return;
  }
  const [taken, changed] = await Promise.all([
    prisma.classSession.findFirst({ where: { slotId: cls.slotId, date: dateOf(cls.date) }, select: { id: true } }),
    prisma.classChange.findFirst({ where: { slotId: cls.slotId, date: dateOf(cls.date) }, select: { type: true } }),
  ]);
  if (taken) throw Conflict(`Attendance was already taken for ${lower} class.`, 'ALREADY_TAKEN');
  if (changed) throw Conflict(`${whose} class is already ${changed.type === 'cancelled' ? 'cancelled' : 'covered'} that day.`, 'ALREADY_CHANGED');
}

/** Ids the clash check should skip: both classes being swapped (they move away). */
const ignoreIds = (a, b) => [a.cls.slotId, a.cls.changeId, b.cls.slotId, b.cls.changeId].filter(Boolean);

/**
 * Would the swap clash with anything? Each module moves to the other class's date, time and room.
 * Returns the blocking reasons.
 */
async function swapClashes(term, a, b, tutorA, tutorB) {
  const out = [];
  for (const [mine, other, tutor] of [[a.cls, b.cls, tutorA], [b.cls, a.cls, tutorB]]) {
    const day = await loadDay(term, other.date, mine.module.id);
    const list = cc.clashes(day, {
      start: other.start, end: other.end, roomId: other.room?.id, tutorId: tutor, moduleId: mine.module.id,
      ignore: ignoreIds(a, b), self: tutor,
    });
    out.push(...blocking(list, mine.counts !== false).map((c) => `${mine.module.code} at ${span12(other.start, other.end)}: ${c.text}`));
  }
  return out;
}

/** B's classes on a date that A could swap with: timetable classes and booked extra classes. */
async function optionsFor(tutorId, { tutor, date }) {
  const term = await currentAcademicSession();
  await checkDate(term, date);
  const secs = await sectionsNow(term);
  const [slots, changes, sessions] = await Promise.all([
    prisma.timetableSlot.findMany({ where: { academicSession: term, dayOfWeek: dowOf(date) }, include: slotInclude, orderBy: { startTime: 'asc' } }),
    prisma.classChange.findMany({ where: { academicSession: term, date: dateOf(date) }, include: changeInclude }),
    prisma.classSession.findMany({ where: { date: dateOf(date) }, select: { slotId: true, changeId: true } }),
  ]);
  const used = new Set([...changes.filter((c) => c.slotId).map((c) => c.slotId), ...sessions.map((s) => s.slotId), ...sessions.map((s) => s.changeId)].filter(Boolean));
  const now = date === todayStr() ? nowHHMM() : null;
  const later = (start) => !(now && start <= now);
  const theirs = (moduleId) => teaches(secs, tutor, moduleId);
  return [
    ...slots.filter((s) => s.moduleId && theirs(s.moduleId) && !used.has(s.id) && later(hhmm(s.startTime))).map((s) => fromSlot(s, date).cls),
    ...changes.filter((c) => c.type === 'extra' && theirs(c.moduleId) && !used.has(c.id) && later(hhmm(c.startTime))).map((c) => fromChange(c).cls),
  ].sort((x, y) => x.start.localeCompare(y.start));
}

/** Tutor A asks tutor B to swap. body: { slot+date | change, withTutor, withSlot+withDate | withChange, note } */
async function request(tutorId, b) {
  const term = await currentAcademicSession();
  if (b.withTutor === tutorId) throw BadRequest('Choose another tutor.', 'BAD_SWAP');
  const other = await prisma.user.findUnique({ where: { id: b.withTutor }, select: { id: true, name: true, role: true, isActive: true } });
  if (!other || other.role !== 'tutor' || !other.isActive) throw BadRequest('Choose an active tutor.', 'BAD_SWAP');

  const [mine, theirs] = await Promise.all([
    loadSide({ slotId: b.slot, date: b.date, changeId: b.change }),
    loadSide({ slotId: b.withSlot, date: b.withDate, changeId: b.withChange }),
  ]);
  await Promise.all([checkDate(term, mine.cls.date), checkDate(term, theirs.cls.date)]);
  const secs = await sectionsNow(term);
  if (!teaches(secs, tutorId, mine.cls.module.id)) throw Forbidden('You can only swap classes of modules you teach.', 'NOT_YOUR_MODULE');
  if (!teaches(secs, other.id, theirs.cls.module.id)) throw BadRequest(`${other.name} doesn't teach ${theirs.cls.module.code}.`, 'BAD_SWAP');
  if (JSON.stringify(mine.ref) === JSON.stringify(theirs.ref)) throw BadRequest('Choose two different classes.', 'BAD_SWAP');
  await checkSwappable(mine, 'Your');
  await checkSwappable(theirs, 'Their');

  const sideWhere = (s) => (s.kind === 'extra'
    ? [{ fromChangeId: s.cls.changeId }, { toChangeId: s.cls.changeId }]
    : [{ fromSlotId: s.cls.slotId, fromDate: dateOf(s.cls.date) }, { toSlotId: s.cls.slotId, toDate: dateOf(s.cls.date) }]);
  const open = await prisma.swapRequest.findFirst({ where: { status: 'pending', OR: [...sideWhere(mine), ...sideWhere(theirs)] } });
  if (open) throw Conflict('One of these classes already has a swap request waiting for an answer.', 'SWAP_PENDING');

  const stop = await swapClashes(term, mine, theirs, tutorId, other.id);
  if (stop.length) throw Conflict(`Can't swap these classes. ${stop.join(' ')}`, 'CLASH');

  const me = await prisma.user.findUnique({ where: { id: tutorId }, select: { name: true } });
  const sw = await prisma.swapRequest.create({
    data: {
      fromTutorId: tutorId, toTutorId: other.id, note: b.note || null,
      fromSlotId: mine.cls.slotId, fromDate: mine.kind === 'slot' ? dateOf(mine.cls.date) : null, fromChangeId: mine.cls.changeId,
      toSlotId: theirs.cls.slotId, toDate: theirs.kind === 'slot' ? dateOf(theirs.cls.date) : null, toChangeId: theirs.cls.changeId,
    },
  });
  await notify(other.id,
    `${me?.name || 'A tutor'} wants to swap classes: your ${label(theirs.cls)} with their ${label(mine.cls)}. ` +
    `Open your Timetable → Swap requests to accept or reject.${b.note ? ` Note: ${b.note}` : ''}`, 'Reminders');
  return { id: sw.id, status: sw.status, mine: mine.cls, theirs: theirs.cls, with: { id: other.id, name: other.name } };
}

async function out(sw) {
  const [a, b] = await Promise.all([loadSide(sideOfRow(sw, 'from')), loadSide(sideOfRow(sw, 'to'))]).catch(() => [null, null]);
  if (!a || !b) return null; // a class was removed since
  const started = (x) => x.date + x.start <= todayStr() + nowHHMM();
  const expired = sw.status === 'pending' && (started(a.cls) || started(b.cls));
  return {
    id: sw.id, status: expired ? 'expired' : sw.status, note: sw.note, createdAt: sw.createdAt, decidedAt: sw.decidedAt,
    from: { id: sw.fromTutorId, name: sw.fromTutor?.name, class: a.cls },
    to: { id: sw.toTutorId, name: sw.toTutor?.name, class: b.cls },
  };
}

/** Swap requests for a tutor: incoming and outgoing, pending ones and the last 14 days. */
async function list(tutorId) {
  const since = new Date(Date.now() - 14 * 86400000);
  const rows = await prisma.swapRequest.findMany({
    where: { OR: [{ fromTutorId: tutorId }, { toTutorId: tutorId }], AND: [{ OR: [{ status: 'pending' }, { createdAt: { gte: since } }] }] },
    include: { fromTutor: { select: { name: true } }, toTutor: { select: { name: true } } },
    orderBy: { createdAt: 'desc' }, take: 30,
  });
  const all = (await Promise.all(rows.map(out))).filter(Boolean);
  return { incoming: all.filter((s) => s.to.id === tutorId), outgoing: all.filter((s) => s.from.id === tutorId) };
}

async function pendingFor(id) {
  const sw = await prisma.swapRequest.findUnique({ where: { id }, include: { fromTutor: { select: { name: true } }, toTutor: { select: { name: true } } } });
  if (!sw) throw NotFound('Swap request not found', 'SWAP_NOT_FOUND');
  if (sw.status !== 'pending') throw Conflict(`This swap request was already ${sw.status}.`, 'SWAP_DONE');
  return sw;
}

/** Tutor B accepts: the two classes exchange date, time and room. */
async function accept(tutorId, id) {
  const sw = await pendingFor(id);
  if (sw.toTutorId !== tutorId) throw Forbidden('Only the tutor who was asked can accept this swap.', 'NOT_YOURS');
  const term = await currentAcademicSession();
  const [a, b] = await Promise.all([loadSide(sideOfRow(sw, 'from')), loadSide(sideOfRow(sw, 'to'))]);
  await checkSwappable(a, 'Their');
  await checkSwappable(b, 'Your');
  const stop = await swapClashes(term, a, b, sw.fromTutorId, sw.toTutorId);
  if (stop.length) throw Conflict(`Can't swap any more. ${stop.join(' ')}`, 'CLASH');

  const reason = `${REASONS.swap} (${sw.fromTutor?.name} ↔ ${sw.toTutor?.name})`.slice(0, 200);
  const time = (hm) => new Date(`1970-01-01T${hm}:00Z`);
  // Move `x` (owned by tutor `by`) to the date, time and room of `to`
  const moveOps = (x, to, by) => {
    const at = { date: dateOf(to.cls.date), startTime: time(to.cls.start), endTime: time(to.cls.end), roomId: to.cls.room?.id ?? null };
    if (x.kind === 'extra') {
      return [prisma.classChange.update({ where: { id: x.cls.changeId }, data: { ...at, reason }, include })];
    }
    const s = x.row;
    return [
      prisma.classChange.create({
        data: {
          type: 'cancelled', date: dateOf(x.cls.date), slotId: s.id, moduleId: s.moduleId, roomId: s.roomId,
          startTime: s.startTime, endTime: s.endTime, sessionType: s.sessionType || 'theory', counts: true, reason, academicSession: term, createdBy: by,
        },
      }),
      prisma.classChange.create({
        data: { type: 'extra', slotId: null, moduleId: s.moduleId, sessionType: s.sessionType || 'theory', counts: true, reason, academicSession: term, createdBy: by, ...at },
        include,
      }),
    ];
  };
  const opsA = moveOps(a, b, sw.fromTutorId), opsB = moveOps(b, a, sw.toTutorId);
  const res = await prisma.$transaction([
    ...opsA, ...opsB,
    prisma.swapRequest.update({ where: { id }, data: { status: 'accepted', decidedAt: new Date() } }),
  ]);
  const na = changeOut(res[opsA.length - 1]), nb = changeOut(res[opsA.length + opsB.length - 1]);
  const where = (x) => (x.room ? ` in ${x.room.name}` : '');
  const tell = (from, to) => tellStudents(from.module.id, term,
    `Class moved: ${from.module.code} – ${from.module.name} on ${nice(from.date)} is no longer at ${span12(from.start, from.end)}. ` +
    `Please come on ${nice(to.date)}, ${span12(to.start, to.end)}${where(to)} instead.`, `Class moved: ${from.module.code}`);
  await tell(a.cls, na);
  await tell(b.cls, nb);
  await notify(sw.fromTutorId,
    `${sw.toTutor?.name || 'The tutor'} accepted your swap. You now teach ${a.cls.module.code} on ${nice(na.date)}, ${span12(na.start, na.end)}${where(na)}. Students have been told.`, 'Reminders');
  return { id, status: 'accepted', yourClass: nb, theirClass: na };
}

/** Tutor B rejects. */
async function reject(tutorId, id) {
  const sw = await pendingFor(id);
  if (sw.toTutorId !== tutorId) throw Forbidden('Only the tutor who was asked can reject this swap.', 'NOT_YOURS');
  await prisma.swapRequest.update({ where: { id }, data: { status: 'rejected', decidedAt: new Date() } });
  const [a, b] = await Promise.all([loadSide(sideOfRow(sw, 'from')), loadSide(sideOfRow(sw, 'to'))]);
  await notify(sw.fromTutorId, `${sw.toTutor?.name || 'The tutor'} rejected your swap of ${label(a.cls)} with ${label(b.cls)}. Nothing has changed.`, 'Reminders');
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
