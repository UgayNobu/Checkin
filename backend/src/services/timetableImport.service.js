// ─────────────────────────────────────────────────────────────
// Upload a semester's timetable (admin, Semesters page).
//
// The admin fills in the CSV template (one row per weekly class) and uploads it for one
// semester. First a preview (dryRun) checks every row and lists the problems; nothing is
// saved until there are none and the admin confirms. Saving replaces that semester's
// timetable only, and only while no attendance has been taken from it yet, so the current
// semester's records can never be cut off from their classes.
//
// Columns (header names, any order, case does not matter):
//   programme, year, semester, day, start, end, module, type, group, room, tutors, note
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { BadRequest, NotFound, Conflict } = require('../utils/errors');
const { writeAuditLog } = require('./audit.service');

const DAYS = { mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6, sun: 7, sunday: 7 };
const TYPES = ['theory', 'practical', 'tutorial'];
const MAX_ROWS = 3000;
const squash = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const plainProgramme = (t) => squash(String(t || '').replace(/^\s*B\.?\s*E\.?\s+/i, '')); // "B.E. Civil Engineering" = "Civil Engineering"

/** "9:00", "09:00", "9.00", "0900", "9:00 AM", "1:15 PM" → minutes after midnight, or null. */
function minutesOf(t) {
  const m = String(t || '').trim().toUpperCase().match(/^(\d{1,2})[:.]?(\d{2})\s*(AM|PM)?$/);
  if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2]);
  if (m[3] === 'PM' && h < 12) h += 12;
  if (m[3] === 'AM' && h === 12) h = 0;
  return h < 24 && min < 60 ? h * 60 + min : null;
}
const hhmm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
const timeValue = (mins) => new Date(`1970-01-01T${hhmm(mins)}:00Z`);

/**
 * Checks every row. Returns { semester, ok, count, errors: [{ row, message }], classes } — classes
 * are the rows ready to save. Row numbers count the header as row 1, as in a spreadsheet.
 */
async function check(code, rows) {
  const term = await prisma.academicSession.findUnique({ where: { code } });
  if (!term) throw NotFound(`Semester ${code} not found. Add it on this page first.`);
  if (!Array.isArray(rows) || !rows.length) throw BadRequest('The file has no classes in it.', 'EMPTY_FILE');
  if (rows.length > MAX_ROWS) throw BadRequest(`The file has ${rows.length} rows; the most is ${MAX_ROWS}.`, 'TOO_MANY_ROWS');

  const [programs, modules, rooms] = await Promise.all([
    prisma.program.findMany({ select: { id: true, name: true } }),
    prisma.module.findMany({ select: { id: true, code: true } }),
    prisma.room.findMany({ select: { id: true, name: true } }),
  ]);
  const progBy = new Map();
  for (const p of programs) { progBy.set(squash(p.id), p); progBy.set(squash(p.name), p); progBy.set(plainProgramme(p.name), p); }
  const modBy = new Map(modules.map((m) => [squash(m.code), m]));
  const roomBy = new Map(rooms.map((r) => [squash(r.name), r]));

  const errors = [], classes = [], seen = new Map(), roomUse = [];
  rows.forEach((raw, i) => {
    const r = Object.fromEntries(Object.entries(raw || {}).map(([k, v]) => [String(k).trim().toLowerCase(), String(v ?? '').trim()]));
    const n = i + 2; // spreadsheet row number (row 1 is the header)
    if (!Object.values(r).some(Boolean)) return; // empty line
    const bad = (message) => errors.push({ row: n, message });

    const program = progBy.get(squash(r.programme || r.program)) || progBy.get(plainProgramme(r.programme || r.program));
    const year = Number(r.year), semester = Number(r.semester || 1);
    const day = DAYS[String(r.day || '').toLowerCase()] || (/^[1-7]$/.test(r.day) ? Number(r.day) : null);
    const start = minutesOf(r.start), end = minutesOf(r.end);
    const mod = modBy.get(squash(r.module || r['module code']));
    const type = String(r.type || 'theory').toLowerCase();
    const room = r.room ? roomBy.get(squash(r.room)) : null;
    const group = r.group || null;

    if (!program) bad(`Programme "${r.programme || r.program || ''}" not found.`);
    if (!(year >= 1 && year <= 5)) bad('Year must be 1 to 5.');
    if (![1, 2].includes(semester)) bad('Semester must be 1 or 2.');
    if (!day) bad(`Day "${r.day || ''}" is not a day of the week (Mon … Sun).`);
    if (start == null || end == null) bad('Start and end must be times like 09:00 or 1:15 PM.');
    else if (end <= start) bad('The end time must be after the start time.');
    if (!mod) bad(`Module "${r.module || r['module code'] || ''}" not found. Add it under Program / Module first.`);
    if (!TYPES.includes(type)) bad('Type must be theory, practical or tutorial.');
    if (r.room && !room) bad(`Room "${r.room}" not found.`);
    if (group && group.length > 5) bad('Group must be 5 characters or fewer (e.g. A, B, G1).');
    if (errors.some((e) => e.row === n)) return;

    // the same class twice in the file
    const key = [program.id, year, day, start, mod.id, type, group || ''].join('|');
    if (seen.has(key)) return bad(`Same class as row ${seen.get(key)}.`);
    seen.set(key, n);
    // two classes in one room at the same time
    if (room) {
      const clash = roomUse.find((u) => u.room === room.id && u.day === day && u.start < end && start < u.end);
      if (clash) return bad(`${room.name} is already used at that time by row ${clash.row}.`);
      roomUse.push({ room: room.id, day, start, end, row: n });
    }
    classes.push({
      programId: program.id, year, semester, academicSession: code, dayOfWeek: day, startTime: timeValue(start), endTime: timeValue(end),
      moduleCode: mod.code, moduleId: mod.id, sessionType: type, groupLabel: group, roomId: room?.id ?? null,
      tutorNames: (r.tutors || r.tutor || '').slice(0, 255) || null, note: (r.note || '').slice(0, 50) || null,
    });
  });
  return { semester: { code: term.code, name: term.name }, ok: errors.length === 0 && classes.length > 0, count: classes.length, errors, classes };
}

/** Preview only: what would be saved and what is wrong. */
async function preview(code, rows) {
  const { classes, ...rest } = await check(code, rows);
  const existing = await prisma.timetableSlot.count({ where: { academicSession: code } });
  return { ...rest, replaces: existing };
}

/** Save: replaces the semester's timetable (refused if any row is wrong or attendance was already taken). */
async function save(adminId, code, rows) {
  const r = await check(code, rows);
  if (!r.ok) throw BadRequest(`The file has ${r.errors.length} problem${r.errors.length === 1 ? '' : 's'}. Fix them and upload it again.`, 'TIMETABLE_INVALID');
  const used = await prisma.classSession.count({ where: { slot: { academicSession: code } } });
  if (used) throw Conflict(`Attendance has already been taken from ${r.semester.name}'s timetable, so it can't be replaced. Change single classes on the Timetable instead.`, 'TIMETABLE_IN_USE');
  const [, created] = await prisma.$transaction([
    prisma.timetableSlot.deleteMany({ where: { academicSession: code } }),
    prisma.timetableSlot.createMany({ data: r.classes }),
  ]);
  await writeAuditLog(adminId, 'Timetable uploaded', `${code}: ${created.count} classes`);
  return { semester: r.semester, saved: created.count };
}

module.exports = { preview, save, minutesOf };
