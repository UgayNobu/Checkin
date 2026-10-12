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

/** A student's own week, from the programme and year on their profile. */
async function forStudent(studentId) {
  const u = await prisma.user.findUnique({ where: { id: studentId } });
  if (!u.programme) throw BadRequest('Your programme is not set in your profile', 'NO_PROGRAMME');
  return slots({ program: { name: u.programme }, year: u.year || 1 });
}

/** A tutor's own week: slots linked to their account, or listing their name. */
async function forTutor(tutorId) {
  const u = await prisma.user.findUnique({ where: { id: tutorId } });
  return slots({ OR: [{ tutorId: u.id }, ...(u.name ? [{ tutorNames: { contains: u.name, mode: 'insensitive' } }] : [])] });
}

module.exports = { listRooms, forProgramme, forStudent, forTutor, slotOut };
