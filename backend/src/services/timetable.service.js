// ─────────────────────────────────────────────────────────────
// Rooms and the fixed weekly timetable. Each semester's timetable is
// loaded with its own academic_session (AS2026 = Autumn 2026, …) and only
// the current semester's is shown. The data is loaded separately
// (prisma/timetable_AS2026.sql, kept out of git because it has staff names).
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { BadRequest } = require('../utils/errors');
const { currentAcademicSession } = require('../lib/academicSession');

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
// Only the current semester's timetable (each year's timetable is loaded with its own academic_session)
const slots = async (where) =>
  (await prisma.timetableSlot.findMany({ where: { AND: [where, { academicSession: await currentAcademicSession() }] }, include, orderBy })).map(slotOut);

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
const DAY_MS = 24 * 60 * 60 * 1000;
const ymd = (d) => d.toISOString().slice(0, 10);
/** Monday of the week a date falls in (default: this week in Bhutan), as a UTC-midnight Date. */
function mondayOf(week) {
  const d = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? new Date(`${week}T00:00:00Z`) : new Date(`${ymd(bhutanNow())}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return mondayOf();
  return new Date(d.getTime() - ((d.getUTCDay() || 7) - 1) * DAY_MS);
}

/**
 * Gives each slot the date it falls on in the chosen week and, if attendance was taken
 * from it that day, the session (and for a student, their own status in it).
 * class_sessions.date is the day a session starts (a DATE, compared at midnight UTC).
 */
async function addWeek(list, studentId, week) {
  const monday = mondayOf(week), sunday = new Date(monday.getTime() + 6 * DAY_MS), today = ymd(bhutanNow());
  const ids = list.map((x) => x.id);
  const sessions = ids.length ? await prisma.classSession.findMany({
    where: { slotId: { in: ids }, date: { gte: monday, lte: sunday } },
    orderBy: { startTime: 'desc' },
    select: {
      id: true, slotId: true, status: true, date: true, counts: true, taker: { select: { name: true } },
      ...(studentId && { attendance: { where: { studentId }, select: { status: true } } }),
    },
  }) : [];
  const bySlotDay = new Map();
  for (const se of sessions) {
    const k = `${se.slotId}|${ymd(se.date)}`;
    if (!bySlotDay.has(k)) bySlotDay.set(k, se); // newest per slot and day
  }
  return list.map((x) => {
    const date = ymd(new Date(monday.getTime() + (x.dayOfWeek - 1) * DAY_MS));
    const se = bySlotDay.get(`${x.id}|${date}`);
    return {
      ...x, date, isToday: date === today,
      session: se ? { id: se.id, status: se.status, myStatus: se.attendance?.[0]?.status ?? null, takenBy: se.taker?.name ?? null } : null,
    };
  });
}

/**
 * A student's week: their programme and year's timetable, plus any other module
 * they are enrolled in. `enrolled` marks the classes they joined in the VLE.
 */
async function forStudent(studentId, { week } = {}) {
  const [u, en] = await Promise.all([
    prisma.user.findUnique({ where: { id: studentId }, select: { programme: true, year: true } }),
    prisma.enrollment.findMany({ where: { studentId, academicSession: await currentAcademicSession() }, select: { moduleId: true } }),
  ]);
  const enrolled = en.map((e) => e.moduleId);
  const or = [];
  if (u?.programme) or.push({ program: { name: u.programme }, year: u.year || 1 });
  if (enrolled.length) or.push({ moduleId: { in: enrolled } });
  if (!or.length) return [];
  const list = (await slots({ OR: or })).map((x) => ({ ...x, enrolled: enrolled.includes(x.module.id) }));
  return addWeek(list, studentId, week);
}

/**
 * A tutor's week: slots for the modules the admin assigned to them, plus slots
 * linked to their account or listing their name. `teaches` = they can start attendance for it.
 */
async function forTutor(tutorId, { week } = {}) {
  const [u, secs] = await Promise.all([
    prisma.user.findUnique({ where: { id: tutorId }, select: { id: true, name: true } }),
    prisma.section.findMany({ where: { tutorId, academicSession: await currentAcademicSession() }, select: { moduleId: true } }),
  ]);
  const taught = [...new Set(secs.map((x) => x.moduleId))];
  const list = (await slots({
    OR: [
      { tutorId: u.id },
      ...(u.name ? [{ tutorNames: { contains: u.name, mode: 'insensitive' } }] : []),
      ...(taught.length ? [{ moduleId: { in: taught } }] : []),
    ],
  })).map((x) => ({ ...x, teaches: taught.includes(x.module.id) }));
  return addWeek(list, null, week);
}

/** One slot, for starting attendance from the timetable. */
async function getSlot(id) {
  const x = await prisma.timetableSlot.findUnique({ where: { id }, include });
  return x ? slotOut(x) : null;
}

module.exports = { listRooms, forProgramme, forStudent, forTutor, getSlot, slotOut, todayDayOfWeek, mondayOf };
