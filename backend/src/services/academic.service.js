// ─────────────────────────────────────────────────────────────
// Academic sessions (semesters): list them, add the next one, and
// "Start new semester" (make it the current one).
//
// Starting a semester changes nothing in the past: old classes,
// attendance, enrolments and tutor assignments stay with their own
// semester and can still be viewed with ?session=AS2026.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { BadRequest, NotFound, Conflict } = require('../utils/errors');
const { writeAuditLog } = require('./audit.service');
const { clearAcademicSessionCache } = require('../lib/academicSession');

const day = (d) => d.toISOString().slice(0, 10);
const nice = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const out = (a, counts) => ({
  code: a.code, name: a.name, term: a.term, startDate: day(a.startDate), endDate: day(a.endDate), isCurrent: a.isCurrent,
  ...(counts && { tutorAssignments: counts.sections, enrolments: counts.enrollments, timetableSlots: counts.slots }),
});

/** Every semester, newest first, with how much data each one holds. */
async function list() {
  const rows = await prisma.academicSession.findMany({
    orderBy: { startDate: 'desc' },
    include: { _count: { select: { sections: true, enrollments: true, slots: true } } },
  });
  return rows.map((a) => out(a, a._count));
}

/** Add a semester (not current yet). The code says which one: AS2027 = Autumn 2027, SS2027 = Spring 2027. */
async function create(adminId, { code, name, startDate, endDate }) {
  const term = code.startsWith('AS') ? 'autumn' : 'spring';
  if (new Date(endDate) <= new Date(startDate)) throw BadRequest('The end date must be after the start date', 'BAD_DATES');
  if (await prisma.academicSession.findUnique({ where: { code } })) throw Conflict(`${code} already exists`, 'SESSION_EXISTS');
  // Two semesters can't run at the same time
  const clash = await prisma.academicSession.findFirst({
    where: { startDate: { lte: new Date(endDate) }, endDate: { gte: new Date(startDate) } },
  });
  if (clash) throw Conflict(`These dates overlap ${clash.name} (${nice(clash.startDate)} – ${nice(clash.endDate)}). Pick dates after it ends.`, 'SESSION_OVERLAP');
  const a = await prisma.academicSession.create({
    data: {
      code, term, startDate: new Date(startDate), endDate: new Date(endDate),
      name: name || `${term === 'autumn' ? 'Autumn' : 'Spring'} Semester ${code.slice(2)}`,
    },
  });
  await writeAuditLog(adminId, 'Semester added', `${a.code} (${day(a.startDate)} – ${day(a.endDate)})`);
  return out(a);
}

/**
 * "Start new semester": make `code` the current semester.
 * promoteYears (for a new academic year, i.e. Autumn): every student below their
 * programme's final year moves up one year. Final-year students are left as they are.
 */
async function makeCurrent(adminId, code, { promoteYears = false } = {}) {
  const a = await prisma.academicSession.findUnique({ where: { code } });
  if (!a) throw NotFound('Semester not found', 'SESSION_NOT_FOUND');
  if (a.isCurrent) throw Conflict(`${code} is already the current semester`, 'ALREADY_CURRENT');
  const before = await prisma.academicSession.findFirst({ where: { isCurrent: true } });

  const promoted = await prisma.$transaction(async (tx) => {
    // Two steps because only one semester may be current at a time (unique index)
    await tx.academicSession.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
    await tx.academicSession.update({ where: { code }, data: { isCurrent: true } });
    if (!promoteYears) return 0;
    return tx.$executeRaw`
      UPDATE users u SET year = u.year + 1
      FROM programs p
      WHERE u.role = 'student' AND u.programme = p.program_name
        AND u.year IS NOT NULL AND u.year < COALESCE(p.duration_years, 4)`;
  });
  clearAcademicSessionCache();
  await writeAuditLog(adminId, 'Semester started', `${before?.code ?? '—'} → ${code}${promoteYears ? `, ${promoted} students moved up a year` : ''}`);
  return { current: code, previous: before?.code ?? null, studentsPromoted: promoted };
}

/** The current semester (any logged-in user). */
async function current() {
  const a = await prisma.academicSession.findFirst({ where: { isCurrent: true } });
  return a ? out(a) : null;
}

module.exports = { list, create, makeCurrent, current };
