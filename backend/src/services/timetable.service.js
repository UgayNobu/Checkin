// ─────────────────────────────────────────────────────────────
// Rooms and the fixed weekly timetable (AS2026). The timetable data
// is loaded separately (prisma/timetable_AS2026.sql, kept out of git
// because it contains staff names).
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { BadRequest } = require('../utils/errors');

const DAY = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hhmm = (t) => t.toISOString().slice(11, 16); // TIME columns come back as 1970-01-01T09:00:00Z

const slotOut = (x) => ({
  id: x.id, day: DAY[x.dayOfWeek], dayOfWeek: x.dayOfWeek, start: hhmm(x.startTime), end: hhmm(x.endTime),
  year: x.year, semester: x.semester, programme: x.program?.name,
  module: { id: x.moduleId, code: x.moduleCode, name: x.module?.name || x.moduleCode },
  type: x.sessionType, group: x.groupLabel,
  room: x.room ? { id: x.room.id, name: x.room.name, location: x.room.location } : null,
  tutors: x.tutorNames, note: x.note,
});
const include = { program: true, module: true, room: true };
const orderBy = [{ dayOfWeek: 'asc' }, { startTime: 'asc' }];
const slots = async (where) => (await prisma.timetableSlot.findMany({ where, include, orderBy })).map(slotOut);

const listRooms = () => prisma.room.findMany({ orderBy: { name: 'asc' } });

/** Whole week for one programme + year. */
async function forProgramme({ program, year }) {
  if (!program || !year) throw BadRequest('Choose a programme and year', 'VALIDATION_ERROR');
  return slots({ program: { name: program }, year });
}

// Bhutan is UTC+6 all year (no daylight saving), so "today" is worked out in Bhutan time
// even when the server runs in UTC (e.g. on Render).
const BHUTAN_OFFSET_MS = 6 * 60 * 60 * 1000;
const bhutanNow = () => new Date(Date.now() + BHUTAN_OFFSET_MS);
/** 1 = Monday … 7 = Sunday, in Bhutan. */
const todayDayOfWeek = () => bhutanNow().getUTCDay() || 7;
/** class_sessions.date is saved as the day a session starts (a DATE, compared at midnight UTC). */
const todayDate = () => { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())); };

/**
 * For today's slots: the session started from that slot today (if any) and,
 * for a student, their attendance in it. Adds `today` to each slot of today's weekday.
 */
async function addToday(list, studentId) {
  const dow = todayDayOfWeek();
  const ids = list.filter((x) => x.dayOfWeek === dow).map((x) => x.id);
  if (!ids.length) return list;
  const sessions = await prisma.classSession.findMany({
    where: { slotId: { in: ids }, date: todayDate() },
    orderBy: { startTime: 'desc' },
    select: {
      id: true, slotId: true, status: true,
      ...(studentId && { attendance: { where: { studentId }, select: { status: true } } }),
    },
  });
  const bySlot = new Map();
  for (const se of sessions) if (!bySlot.has(se.slotId)) bySlot.set(se.slotId, se); // newest per slot
  return list.map((x) => {
    if (x.dayOfWeek !== dow) return x;
    const se = bySlot.get(x.id);
    return { ...x, isToday: true, session: se ? { id: se.id, status: se.status, myStatus: se.attendance?.[0]?.status ?? null } : null };
  });
}

/**
 * A student's week: their programme and year's timetable, plus any other module
 * they are enrolled in. `enrolled` marks the classes they joined in the VLE.
 */
async function forStudent(studentId) {
  const [u, en] = await Promise.all([
    prisma.user.findUnique({ where: { id: studentId }, select: { programme: true, year: true } }),
    prisma.enrollment.findMany({ where: { studentId }, select: { moduleId: true } }),
  ]);
  const enrolled = en.map((e) => e.moduleId);
  const or = [];
  if (u?.programme) or.push({ program: { name: u.programme }, year: u.year || 1 });
  if (enrolled.length) or.push({ moduleId: { in: enrolled } });
  if (!or.length) return [];
  const list = (await slots({ OR: or })).map((x) => ({ ...x, enrolled: enrolled.includes(x.module.id) }));
  return addToday(list, studentId);
}

/**
 * A tutor's week: slots for the modules the admin assigned to them, plus slots
 * linked to their account or listing their name. `teaches` = they can start attendance for it.
 */
async function forTutor(tutorId) {
  const [u, secs] = await Promise.all([
    prisma.user.findUnique({ where: { id: tutorId }, select: { id: true, name: true } }),
    prisma.section.findMany({ where: { tutorId }, select: { moduleId: true } }),
  ]);
  const taught = [...new Set(secs.map((x) => x.moduleId))];
  const list = (await slots({
    OR: [
      { tutorId: u.id },
      ...(u.name ? [{ tutorNames: { contains: u.name, mode: 'insensitive' } }] : []),
      ...(taught.length ? [{ moduleId: { in: taught } }] : []),
    ],
  })).map((x) => ({ ...x, teaches: taught.includes(x.module.id) }));
  return addToday(list);
}

/** One slot, for starting attendance from the timetable. */
async function getSlot(id) {
  const x = await prisma.timetableSlot.findUnique({ where: { id }, include });
  return x ? slotOut(x) : null;
}

module.exports = { listRooms, forProgramme, forStudent, forTutor, getSlot, slotOut, todayDayOfWeek };
