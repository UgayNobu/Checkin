// ─────────────────────────────────────────────────────────────
// Class changes: the weekly timetable stays fixed, and anything different
// on ONE date is saved as a change (database.sql Part 11):
//
//   cancelled  a timetable class is not held that day. Nobody is marked absent.
//   cover      another tutor takes a timetable class that day (two covers = a swap).
//   extra      a class that is not on the timetable: a make-up, an extra lecture or a
//              free revision class. counts = false makes it OPTIONAL: attendance is
//              taken but never counts toward anyone's %.
//
// Tutors make changes themselves (no approval step). Management sees every change,
// plus timetable classes that were never taken, on the Class changes page.
//
// Starting attendance also goes through here (planStart): a timetable class can be
// started from 15 minutes before it begins until it ends. At any other time the tutor
// books an extra class, so every session matches a real class.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { env } = require('../config/env');
const { ATTENDED } = require('../config/constants');
const { BadRequest, NotFound, Forbidden, Conflict } = require('../utils/errors');
const { currentAcademicSession } = require('../lib/academicSession');
const { notify } = require('./notifications.service');

const DAY = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ── time helpers (Bhutan is UTC+6 all year) ──────────────────
const hhmm = (t) => t.toISOString().slice(11, 16); // TIME columns come back as 1970-01-01T09:00:00Z
const toTime = (s) => new Date(`1970-01-01T${s}:00Z`);
const minutes = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const fromMinutes = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const bhutanNow = () => new Date(Date.now() + 6 * 3600 * 1000);
const todayStr = () => bhutanNow().toISOString().slice(0, 10);
const nowHHMM = () => bhutanNow().toISOString().slice(11, 16);
const dateOf = (s) => new Date(`${s}T00:00:00Z`); // DATE columns compare at midnight UTC
const ymd = (d) => d.toISOString().slice(0, 10);
const dowOf = (s) => dateOf(s).getUTCDay() || 7; // 1 = Monday … 7 = Sunday
const overlaps = (a1, a2, b1, b2) => a1 < b2 && b1 < a2; // 'HH:MM' strings compare correctly
const nice = (s) => dateOf(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const cohortName = (p, year) => `${(p?.name || '').replace(/^B\.?E\.?\s*/i, '') || 'Programme'} Year ${year}`;

/** A class can be started from this many minutes before it begins until it ends. */
const early = () => env.startEarlyMinutes;
const inWindow = (start, end, now = nowHHMM()) => minutes(now) >= minutes(start) - early() && now < end;

const REASONS = {
  on_leave: 'Tutor on leave',
  college_event: 'College event',
  exam: 'Exam',
  holiday: 'Holiday',
  make_up: 'Make-up class',
  extra_lecture: 'Extra lecture',
  revision: 'Revision class',
  swap: 'Swapped with another tutor',
  other: 'Other',
};
const reasonText = (key, note) => {
  const base = REASONS[key] || 'Other';
  return (note ? `${base}: ${note}` : base).slice(0, 200);
};

// ── who teaches what (this semester) ─────────────────────────
async function sectionsNow(term) {
  const rows = await prisma.section.findMany({ where: { academicSession: term }, select: { id: true, moduleId: true, tutorId: true, tutor: { select: { name: true } } } });
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.moduleId)) map.set(r.moduleId, []);
    map.get(r.moduleId).push({ sectionId: r.id, tutorId: r.tutorId, name: r.tutor?.name });
  }
  return map;
}
const teaches = (secs, tutorId, moduleId) => (secs.get(moduleId) || []).some((t) => t.tutorId === tutorId);
/** The section a session is saved under: this tutor's own, or else the module's first one. */
const sectionFor = (secs, moduleId, tutorId) => {
  const list = secs.get(moduleId) || [];
  return list.find((t) => t.tutorId === tutorId) || list[0] || null;
};

const include = {
  module: true, room: true, slot: { include: { program: true } },
  coverTutor: { select: { id: true, name: true } }, by: { select: { id: true, name: true } },
};

function changeOut(c) {
  return {
    id: c.id, type: c.type, date: ymd(c.date), dayOfWeek: dowOf(ymd(c.date)), start: hhmm(c.startTime), end: hhmm(c.endTime),
    slotId: c.slotId, module: { id: c.moduleId, code: c.module?.code, name: c.module?.name },
    room: c.room ? { id: c.room.id, name: c.room.name, location: c.room.location } : null,
    sessionType: c.sessionType, counts: c.counts, reason: c.reason,
    group: c.slot?.groupLabel || null, cohort: c.slot ? cohortName(c.slot.program, c.slot.year) : null,
    coverTutor: c.coverTutor || null, by: c.by || null, createdAt: c.createdAt,
  };
}

/** Sessions started from these changes: status, how many attended and (for a student) their own status. */
async function withSessions(list, studentId) {
  const ids = list.map((c) => c.id);
  if (!ids.length) return list;
  const rows = await prisma.classSession.findMany({
    where: { changeId: { in: ids } },
    orderBy: { startTime: 'desc' },
    select: { id: true, changeId: true, status: true, attendance: { select: { studentId: true, status: true } } },
  });
  const by = new Map();
  for (const s of rows) if (!by.has(s.changeId)) by.set(s.changeId, s);
  return list.map((c) => {
    const s = by.get(c.id);
    if (!s) return { ...c, session: null };
    const mine = studentId ? s.attendance.find((a) => a.studentId === studentId) : null;
    return {
      ...c,
      session: { id: s.id, status: s.status, attended: s.attendance.filter((a) => ATTENDED.includes(a.status)).length, ...(studentId && { myStatus: mine?.status ?? null }) },
    };
  });
}

/** Modules on a student's programme/year timetable plus the modules they're enrolled in. */
async function studentModules(studentId, term) {
  const [u, en] = await Promise.all([
    prisma.user.findUnique({ where: { id: studentId }, select: { programme: true, year: true } }),
    prisma.enrollment.findMany({ where: { studentId, academicSession: term }, select: { moduleId: true } }),
  ]);
  const ids = new Set(en.map((e) => e.moduleId));
  if (u?.programme) {
    const slots = await prisma.timetableSlot.findMany({
      where: { academicSession: term, program: { name: u.programme }, year: u.year || 1, moduleId: { not: null } },
      select: { moduleId: true }, distinct: ['moduleId'],
    });
    slots.forEach((s) => ids.add(s.moduleId));
  }
  return [...ids];
}

/**
 * Changes between two dates that matter to this user:
 *  tutor → their modules' classes, covers they were asked to take, changes they made;
 *  student → their timetable's modules; management/admin → everything.
 */
async function listFor(user, { from, to }) {
  const term = await currentAcademicSession();
  const where = { academicSession: term, date: { gte: dateOf(from), lte: dateOf(to) } };
  if (user.role === 'teacher') {
    const secs = await prisma.section.findMany({ where: { academicSession: term, tutorId: user.id }, select: { moduleId: true } });
    where.OR = [{ moduleId: { in: secs.map((s) => s.moduleId) } }, { coverTutorId: user.id }, { createdBy: user.id }];
  } else if (user.role === 'student') {
    where.moduleId = { in: await studentModules(user.id, term) };
  }
  const rows = await prisma.classChange.findMany({ where, include, orderBy: [{ date: 'asc' }, { startTime: 'asc' }] });
  return withSessions(rows.map(changeOut), user.role === 'student' ? user.id : null);
}

// ── clashes ───────────────────────────────────────────────────
/**
 * Everything happening on one date (timetable classes not cancelled that day, plus extra
 * classes), and — when a module is given — who its students are, so clashes can be found.
 */
async function loadDay(term, date, moduleId) {
  const [slots, changes, secs] = await Promise.all([
    prisma.timetableSlot.findMany({ where: { academicSession: term, dayOfWeek: dowOf(date) }, include: { module: true, room: true, program: true } }),
    prisma.classChange.findMany({ where: { academicSession: term, date: dateOf(date) }, include: { module: true, room: true, coverTutor: { select: { id: true, name: true } } } }),
    sectionsNow(term),
  ]);
  const bySlot = new Map(changes.filter((c) => c.slotId).map((c) => [c.slotId, c]));
  const names = new Map();
  for (const list of secs.values()) for (const t of list) names.set(t.tutorId, t.name);

  const items = [];
  for (const s of slots) {
    const c = bySlot.get(s.id);
    if (c?.type === 'cancelled') continue;
    const assigned = (secs.get(s.moduleId) || []).map((t) => t.tutorId);
    if (c?.type === 'cover') names.set(c.coverTutorId, c.coverTutor?.name);
    items.push({
      id: s.id, moduleId: s.moduleId, code: s.module?.code || s.moduleCode, start: hhmm(s.startTime), end: hhmm(s.endTime),
      roomId: s.roomId, roomName: s.room?.name, cohort: `${s.programId}|${s.year}`,
      cohortLabel: cohortName(s.program, s.year) + (s.groupLabel ? ` (group ${s.groupLabel})` : ''),
      tutors: c?.type === 'cover' ? [c.coverTutorId] : assigned.length ? assigned : s.tutorId ? [s.tutorId] : [],
    });
  }
  for (const c of changes.filter((x) => x.type === 'extra')) {
    items.push({
      id: c.id, moduleId: c.moduleId, code: c.module?.code, start: hhmm(c.startTime), end: hhmm(c.endTime), roomId: c.roomId, roomName: c.room?.name,
      cohort: null, extra: true, optional: !c.counts,
      tutors: [...new Set([...(secs.get(c.moduleId) || []).map((t) => t.tutorId), c.createdBy].filter(Boolean))],
    });
  }

  // The module's students: the programme/year groups it is timetabled for, and who is enrolled
  const target = { cohorts: new Set(), shared: new Map() };
  if (moduleId) {
    const [mod, mine, enrolled] = await Promise.all([
      prisma.module.findUnique({ where: { id: moduleId }, select: { programId: true, year: true } }),
      prisma.timetableSlot.findMany({ where: { academicSession: term, moduleId }, select: { programId: true, year: true }, distinct: ['programId', 'year'] }),
      prisma.enrollment.findMany({ where: { moduleId, academicSession: term, student: { isActive: true } }, select: { studentId: true } }),
    ]);
    mine.forEach((s) => target.cohorts.add(`${s.programId}|${s.year}`));
    if (!mine.length && mod?.year) target.cohorts.add(`${mod.programId}|${mod.year}`);
    if (enrolled.length) {
      const other = await prisma.enrollment.groupBy({
        by: ['moduleId'], where: { academicSession: term, studentId: { in: enrolled.map((e) => e.studentId) }, moduleId: { not: moduleId } }, _count: { _all: true },
      });
      other.forEach((o) => target.shared.set(o.moduleId, o._count._all));
    }
  }
  return { items, names, secs, target };
}

/**
 * Clashes for a class at start–end. Each has kind room | tutor | students.
 * ignore = an item id to skip (the class being covered).
 */
function clashes(day, { start, end, roomId, tutorId, moduleId, ignore, self }) {
  const out = [], seen = new Set();
  const add = (kind, text) => { if (!seen.has(text)) { seen.add(text); out.push({ kind, text }); } };
  for (const it of day.items) {
    if (it.id === ignore || !overlaps(start, end, it.start, it.end)) continue;
    const what = `${it.code}${it.extra ? ' (extra class)' : ''} at ${it.start}–${it.end}`;
    if (roomId && it.roomId === roomId) add('room', `Room ${it.roomName} is used for ${what}.`);
    if (tutorId && it.tutors.includes(tutorId)) add('tutor', tutorId === self ? `You teach ${what}.` : `${day.names.get(tutorId) || 'That tutor'} teaches ${what}.`);
    if (moduleId) {
      if (it.moduleId === moduleId) add('students', `${it.code} already has a class at ${it.start}–${it.end}.`);
      else if (it.cohort && day.target.cohorts.has(it.cohort)) add('students', `${it.cohortLabel} have ${what}.`);
      else if (!it.optional && day.target.shared.get(it.moduleId)) {
        const n = day.target.shared.get(it.moduleId);
        add('students', `${n} of the students ${n === 1 ? 'has' : 'have'} ${what}.`);
      }
    }
  }
  return out;
}
/** Clashes that stop a booking. Student clashes don't block an optional class (nobody has to come). */
const blocking = (list, counts) => list.filter((c) => c.kind !== 'students' || counts);

// The college's 1-hour periods (08:00–09:00, 09:00–10:00, 10:15–11:15 …), read from the timetable
let periodCache = { at: 0, term: null, list: [] };
async function periods(term) {
  if (periodCache.term === term && Date.now() - periodCache.at < 5 * 60_000) return periodCache.list;
  const rows = await prisma.timetableSlot.findMany({ where: { academicSession: term }, select: { startTime: true, endTime: true }, distinct: ['startTime', 'endTime'] });
  const list = rows.map((r) => ({ start: hhmm(r.startTime), end: hhmm(r.endTime) }))
    .filter((p) => minutes(p.end) - minutes(p.start) === 60)
    .sort((a, b) => a.start.localeCompare(b.start));
  periodCache = { at: Date.now(), term, list };
  return list;
}

async function semesterOf(term) {
  return prisma.academicSession.findUnique({ where: { code: term } });
}

/** Common checks for a date a tutor wants to change: today or later, inside the current semester. */
async function checkDate(term, date) {
  const today = todayStr();
  if (date < today) throw BadRequest('Choose today or a later date.', 'PAST_DATE');
  const sem = await semesterOf(term);
  if (sem && date > ymd(sem.endDate)) throw BadRequest(`${sem.name} ends on ${nice(ymd(sem.endDate))}. Choose a date before that.`, 'OUTSIDE_SEMESTER');
  if (sem && date < ymd(sem.startDate)) throw BadRequest(`${sem.name} starts on ${nice(ymd(sem.startDate))}.`, 'OUTSIDE_SEMESTER');
}

/**
 * For the Extra class form: which periods are free that day, which rooms are free at the
 * chosen time, and any clashes. Never throws for a clash — it only reports.
 */
async function check(tutorId, q) {
  const term = await currentAcademicSession();
  const secs = await sectionsNow(term);
  if (!teaches(secs, tutorId, q.module)) throw Forbidden('You can only book classes for modules you teach.', 'NOT_YOUR_MODULE');
  const day = await loadDay(term, q.date, q.module);
  const counts = q.counts !== false;
  const now = q.date === todayStr() ? nowHHMM() : null;

  const free = (start, end) => blocking(clashes(day, { start, end, tutorId, moduleId: q.module, self: tutorId }), counts);
  const out = {
    date: q.date, day: DAY[dowOf(q.date)],
    periods: (await periods(term)).map((p) => {
      const past = !!now && p.end <= now;
      const c = past ? [{ kind: 'time', text: 'Already over.' }] : free(p.start, p.end);
      return { ...p, free: !c.length, past, why: c[0]?.text || null };
    }),
  };
  if (q.start && q.end && q.end > q.start) {
    const all = clashes(day, { start: q.start, end: q.end, roomId: q.room, tutorId, moduleId: q.module, self: tutorId });
    const used = new Set(day.items.filter((it) => it.roomId && overlaps(q.start, q.end, it.start, it.end)).map((it) => it.roomId));
    const rooms = await prisma.room.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, location: true } });
    out.clashes = all.map((c) => ({ ...c, blocks: c.kind !== 'students' || counts }));
    if (now && q.end <= now) out.clashes.unshift({ kind: 'time', text: 'That time has already passed today.', blocks: true });
    out.rooms = rooms.filter((r) => !used.has(r.id));
  }
  return out;
}

/** Active tutors, for "Ask someone to cover". */
async function tutors(tutorId) {
  return prisma.user.findMany({ where: { role: 'tutor', isActive: true, id: { not: tutorId } }, select: { id: true, name: true, department: true }, orderBy: { name: 'asc' } });
}

const enrolledStudents = async (moduleId, term) =>
  (await prisma.enrollment.findMany({ where: { moduleId, academicSession: term, student: { isActive: true } }, select: { studentId: true } })).map((e) => e.studentId);

async function tellStudents(moduleId, term, message) {
  const ids = await enrolledStudents(moduleId, term);
  if (!ids.length) return;
  try {
    await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, message: message.slice(0, 500), category: 'Reminders' })) });
  } catch (e) {
    console.warn('[class-change] could not notify students:', e.message);
  }
}

/** A tutor cancels a timetable class, asks someone to cover it, or books an extra class. */
async function create(tutorId, b) {
  const term = await currentAcademicSession();
  await checkDate(term, b.date);
  const secs = await sectionsNow(term);
  const reason = reasonText(b.reason, b.note);
  const today = todayStr();

  if (b.type === 'extra') {
    if (!teaches(secs, tutorId, b.module)) throw Forbidden('You can only book classes for modules you teach.', 'NOT_YOUR_MODULE');
    if (b.end <= b.start) throw BadRequest('The class must end after it starts.', 'BAD_TIME');
    if (minutes(b.end) - minutes(b.start) > 6 * 60) throw BadRequest('A class can be at most 6 hours.', 'BAD_TIME');
    if (b.date === today && b.end <= nowHHMM()) throw BadRequest('That time has already passed today.', 'PAST_TIME');
    if (b.room && !(await prisma.room.findUnique({ where: { id: b.room } }))) throw BadRequest('Room not found', 'ROOM_NOT_FOUND');
    const counts = b.counts !== false;
    const day = await loadDay(term, b.date, b.module);
    const stop = blocking(clashes(day, { start: b.start, end: b.end, roomId: b.room, tutorId, moduleId: b.module, self: tutorId }), counts);
    if (stop.length) throw Conflict(`Can't book this time. ${stop.map((c) => c.text).join(' ')}`, 'CLASH');

    const c = await prisma.classChange.create({
      data: {
        type: 'extra', date: dateOf(b.date), moduleId: b.module, roomId: b.room || null, startTime: toTime(b.start), endTime: toTime(b.end),
        sessionType: b.sessionType || 'theory', counts, reason, academicSession: term, createdBy: tutorId,
      },
      include,
    });
    const o = changeOut(c);
    await tellStudents(o.module.id, term,
      `${counts ? 'Extra class' : 'Optional class'}: ${o.module.code} on ${nice(o.date)}, ${o.start}–${o.end}${o.room ? ` in ${o.room.name}` : ''}. ` +
      `${counts ? 'Attendance will be taken and counts.' : 'Attendance is taken but does not count toward your %.'} (${reason})`);
    return o;
  }

  // cancelled / cover: a timetable class on one date
  const slot = await prisma.timetableSlot.findUnique({ where: { id: b.slot }, include: { module: true, room: true } });
  if (!slot || slot.academicSession !== term || !slot.moduleId) throw NotFound('Timetable class not found', 'SLOT_NOT_FOUND');
  if (!teaches(secs, tutorId, slot.moduleId)) throw Forbidden('You can only change classes of modules you teach.', 'NOT_YOUR_MODULE');
  if (dowOf(b.date) !== slot.dayOfWeek) throw BadRequest(`This class is on ${DAY[slot.dayOfWeek]}s. Choose a ${DAY[slot.dayOfWeek]}.`, 'WRONG_DAY');
  const start = hhmm(slot.startTime), end = hhmm(slot.endTime);
  if (b.date === today && end <= nowHHMM()) throw BadRequest('This class has already finished today.', 'PAST_TIME');
  const [taken, existing] = await Promise.all([
    prisma.classSession.findFirst({ where: { slotId: slot.id, date: dateOf(b.date) }, select: { id: true } }),
    prisma.classChange.findFirst({ where: { slotId: slot.id, date: dateOf(b.date) }, select: { type: true } }),
  ]);
  if (taken) throw Conflict('Attendance has already been taken for this class on that day.', 'ALREADY_TAKEN');
  if (existing) throw Conflict(`This class is already ${existing.type === 'cancelled' ? 'cancelled' : 'covered'} on that day. Undo that first.`, 'ALREADY_CHANGED');

  let cover = null;
  if (b.type === 'cover') {
    cover = await prisma.user.findUnique({ where: { id: b.coverTutor }, select: { id: true, name: true, role: true, isActive: true } });
    if (!cover || cover.role !== 'tutor' || !cover.isActive) throw BadRequest('Choose an active tutor to cover the class.', 'BAD_COVER');
    if (cover.id === tutorId) throw BadRequest('Choose another tutor.', 'BAD_COVER');
    const day = await loadDay(term, b.date);
    const busy = clashes(day, { start, end, tutorId: cover.id, ignore: slot.id });
    if (busy.length) throw Conflict(`${cover.name} is not free then. ${busy.map((c) => c.text).join(' ')}`, 'CLASH');
  }

  const c = await prisma.classChange.create({
    data: {
      type: b.type, date: dateOf(b.date), slotId: slot.id, moduleId: slot.moduleId, roomId: slot.roomId, startTime: slot.startTime, endTime: slot.endTime,
      sessionType: slot.sessionType, counts: true, coverTutorId: cover?.id ?? null, reason, academicSession: term, createdBy: tutorId,
    },
    include,
  });
  const o = changeOut(c), when = `${o.module.code} on ${nice(o.date)}, ${o.start}–${o.end}${o.room ? ` (${o.room.name})` : ''}`;
  if (b.type === 'cancelled') {
    await tellStudents(o.module.id, term, `Cancelled: ${when}. ${reason}. You will not be marked absent.`);
  } else {
    await notify(cover.id, `${o.by?.name || 'A tutor'} asked you to take ${when}. ${reason}. Start attendance for it from your Timetable.`, 'Reminders');
    await tellStudents(o.module.id, term, `${when} will be taken by ${cover.name}.`);
  }
  return o;
}

/** Undo a change (before the class happens, and only if attendance wasn't taken from it). */
async function remove(tutorId, id) {
  const term = await currentAcademicSession();
  const c = await prisma.classChange.findUnique({ where: { id }, include });
  if (!c) throw NotFound('Class change not found', 'CHANGE_NOT_FOUND');
  const secs = await sectionsNow(term);
  if (c.createdBy !== tutorId && !teaches(secs, tutorId, c.moduleId)) throw Forbidden('Only the tutor of this module can undo it.', 'NOT_YOUR_MODULE');
  const o = changeOut(c);
  if (o.date < todayStr() || (o.date === todayStr() && o.end <= nowHHMM())) throw BadRequest('This class is over, so the change stays on record.', 'PAST_TIME');
  const used = await prisma.classSession.findFirst({ where: { changeId: id }, select: { id: true } });
  if (used) throw Conflict('Attendance was already taken for this class, so it can\'t be undone.', 'ALREADY_TAKEN');
  await prisma.classChange.delete({ where: { id } });

  const when = `${o.module.code} on ${nice(o.date)}, ${o.start}–${o.end}`;
  if (o.type === 'cancelled') await tellStudents(o.module.id, term, `Back on: ${when} is no longer cancelled.`);
  if (o.type === 'extra') await tellStudents(o.module.id, term, `Called off: the ${o.counts ? 'extra' : 'optional'} class ${when}.`);
  if (o.type === 'cover' && o.coverTutor) await notify(o.coverTutor.id, `You no longer need to take ${when}.`, 'Reminders');
  return { id, removed: true };
}

/**
 * What a tutor is starting, worked out from { slot } (a timetable class), { change } (an extra
 * class or a cover) or just { module }. Throws a clear message when it isn't class time.
 * Returns the section to save the session under, the links, and whether it counts.
 */
async function planStart(tutorId, b) {
  const term = await currentAcademicSession();
  const secs = await sectionsNow(term);
  const today = todayStr(), now = nowHHMM(), dow = dowOf(today);
  const notNow = (start, end) => {
    const from = fromMinutes(Math.max(0, minutes(start) - early()));
    return BadRequest(now >= end
      ? `This class (${start}–${end}) is already over. To teach now, book an extra class.`
      : `This class is ${start}–${end}. You can start attendance from ${from}. To teach at another time, book an extra class.`, 'CLASS_NOT_NOW');
  };
  const duration = (s, e) => minutes(e) - minutes(s);
  const type = (t) => (t === 'practical' ? 'practical' : 'theory');

  // An extra class, or a timetable class someone asked this tutor to cover
  if (b.change) {
    const c = await prisma.classChange.findUnique({ where: { id: b.change }, include });
    if (!c || c.academicSession !== term) throw NotFound('Class not found', 'CHANGE_NOT_FOUND');
    const o = changeOut(c);
    if (o.type === 'cancelled') throw BadRequest('This class is cancelled for that day.', 'CANCELLED');
    if (o.type === 'cover' ? o.coverTutor?.id !== tutorId : !teaches(secs, tutorId, o.module.id)) throw Forbidden('This class is not yours to take.', 'NOT_YOUR_CLASS');
    if (o.date !== today) throw BadRequest(`This class is on ${nice(o.date)}.`, 'CLASS_NOT_NOW');
    if (!inWindow(o.start, o.end, now)) throw notNow(o.start, o.end);
    const sec = sectionFor(secs, o.module.id, tutorId);
    if (!sec) throw BadRequest('This module has no tutor assigned this semester.', 'NO_SECTION');
    return {
      sectionId: sec.sectionId, slotId: o.slotId, changeId: o.id, takenBy: o.type === 'cover' ? tutorId : null, counts: o.counts,
      minutes: duration(o.start, o.end), type: type(o.sessionType), room: o.room?.name,
    };
  }

  // A timetable class
  const fromSlot = async (slot) => {
    const start = hhmm(slot.startTime), end = hhmm(slot.endTime);
    const c = await prisma.classChange.findFirst({ where: { slotId: slot.id, date: dateOf(today) }, include: { coverTutor: { select: { id: true, name: true } } } });
    if (c?.type === 'cancelled') throw BadRequest('This class is cancelled for today. Undo the cancellation on your Timetable first.', 'CANCELLED');
    if (c?.type === 'cover') {
      if (c.coverTutorId !== tutorId) throw BadRequest(`${c.coverTutor?.name || 'Another tutor'} is covering this class today.`, 'COVERED');
      return planStart(tutorId, { change: c.id });
    }
    if (!teaches(secs, tutorId, slot.moduleId)) throw Forbidden('This class is not assigned to you.', 'NOT_YOUR_CLASS');
    if (slot.dayOfWeek !== dow) throw BadRequest(`This class is on ${DAY[slot.dayOfWeek]}s. To teach it today, book an extra class.`, 'CLASS_NOT_NOW');
    if (!inWindow(start, end, now)) throw notNow(start, end);
    const sec = sectionFor(secs, slot.moduleId, tutorId);
    return { sectionId: sec.sectionId, slotId: slot.id, changeId: null, takenBy: null, counts: true, minutes: duration(start, end), type: type(slot.sessionType), room: slot.room?.name };
  };

  if (b.slot) {
    const slot = await prisma.timetableSlot.findUnique({ where: { id: b.slot }, include: { room: true } });
    if (!slot || !slot.moduleId || slot.academicSession !== term) throw NotFound('Timetable class not found', 'SLOT_NOT_FOUND');
    return fromSlot(slot);
  }

  // Only a module was chosen: use the class of that module happening now, if there is one
  if (!teaches(secs, tutorId, b.module)) throw Forbidden('You are not assigned to this module', 'NOT_ASSIGNED');
  const [todaySlots, extras, anySlot] = await Promise.all([
    prisma.timetableSlot.findMany({ where: { academicSession: term, moduleId: b.module, dayOfWeek: dow }, include: { room: true }, orderBy: { startTime: 'asc' } }),
    prisma.classChange.findMany({ where: { academicSession: term, moduleId: b.module, date: dateOf(today), type: 'extra' }, orderBy: { startTime: 'asc' } }),
    prisma.timetableSlot.count({ where: { academicSession: term, moduleId: b.module } }),
  ]);
  const extraNow = extras.find((x) => inWindow(hhmm(x.startTime), hhmm(x.endTime), now));
  if (extraNow) return planStart(tutorId, { change: extraNow.id });
  const slotNow = todaySlots.find((s) => inWindow(hhmm(s.startTime), hhmm(s.endTime), now));
  if (slotNow) return fromSlot(slotNow);
  // Modules that aren't on the college timetable can still be started any time
  if (!anySlot && !extras.length) {
    const sec = sectionFor(secs, b.module, tutorId);
    return { sectionId: sec.sectionId, slotId: null, changeId: null, takenBy: null, counts: true, minutes: null, type: null, room: null };
  }
  const next = [...todaySlots.map((s) => [hhmm(s.startTime), hhmm(s.endTime)]), ...extras.map((x) => [hhmm(x.startTime), hhmm(x.endTime)])]
    .filter(([, e]) => e > now).sort()[0];
  throw BadRequest(next
    ? `This module has no class right now. The next one today is ${next[0]}–${next[1]} (you can start from ${fromMinutes(minutes(next[0]) - early())}). To teach now, book an extra class.`
    : 'This module has no class right now. To teach now, book an extra class on your Timetable.', 'CLASS_NOT_NOW');
}

/**
 * Management: every change between two dates, plus timetable classes of assigned modules
 * that were never taken and never cancelled ("not recorded").
 */
async function forManagement({ from, to }) {
  const term = await currentAcademicSession();
  const sem = await semesterOf(term);
  const rows = await prisma.classChange.findMany({
    where: { academicSession: term, date: { gte: dateOf(from), lte: dateOf(to) } },
    include, orderBy: [{ date: 'desc' }, { startTime: 'asc' }],
  });
  const changes = await withSessions(rows.map(changeOut));

  // Not recorded: past timetable classes with a tutor assigned, no session and no change
  const today = todayStr(), now = nowHHMM();
  const start = [from, sem ? ymd(sem.startDate) : from].sort()[1];
  const end = [to, today].sort()[0];
  const notRecorded = [];
  if (start <= end) {
    const secs = await sectionsNow(term);
    const modules = [...secs.keys()];
    const [slots, sessions] = await Promise.all([
      prisma.timetableSlot.findMany({ where: { academicSession: term, moduleId: { in: modules } }, include: { module: true, room: true, program: true } }),
      prisma.classSession.findMany({ where: { slotId: { not: null }, date: { gte: dateOf(start), lte: dateOf(end) } }, select: { slotId: true, date: true } }),
    ]);
    const done = new Set([...sessions.map((s) => `${s.slotId}|${ymd(s.date)}`), ...rows.filter((c) => c.slotId).map((c) => `${c.slotId}|${ymd(c.date)}`)]);
    for (let d = dateOf(start); ymd(d) <= end; d = new Date(d.getTime() + 86400000)) {
      const ds = ymd(d), dow = dowOf(ds);
      for (const s of slots) {
        if (s.dayOfWeek !== dow || done.has(`${s.id}|${ds}`)) continue;
        if (ds === today && hhmm(s.endTime) > now) continue; // not over yet
        notRecorded.push({
          date: ds, start: hhmm(s.startTime), end: hhmm(s.endTime), slotId: s.id,
          module: { id: s.moduleId, code: s.module?.code, name: s.module?.name }, room: s.room ? { name: s.room.name } : null,
          cohort: cohortName(s.program, s.year), group: s.groupLabel, sessionType: s.sessionType,
          tutors: (secs.get(s.moduleId) || []).map((t) => t.name).join(', '),
        });
      }
    }
    notRecorded.sort((a, b) => (b.date + a.start).localeCompare(a.date + b.start));
  }
  const n = (t) => changes.filter((c) => c.type === t).length;
  return {
    from, to, changes, notRecorded,
    summary: {
      cancelled: n('cancelled'), cover: n('cover'),
      extra: changes.filter((c) => c.type === 'extra' && c.counts).length,
      optional: changes.filter((c) => c.type === 'extra' && !c.counts).length,
      notRecorded: notRecorded.length,
    },
  };
}

module.exports = { REASONS, listFor, check, tutors, create, remove, planStart, forManagement, todayStr, nowHHMM, inWindow };
