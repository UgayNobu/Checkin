// Which year of a programme a student is in, worked out from what they are enrolled in.
//
// Sign-up doesn't ask for the year, so every new account starts as Year 1. A 2nd-year student who
// then joins Year 2 modules would still be listed under Year I. Here the year comes from the
// student's enrolments this semester in that programme's modules (the year the module sits in,
// from program_modules); the profile year is only used when there are no such enrolments.
const { prisma } = require('./prisma');
const { currentAcademicSession } = require('./academicSession');
const { mostCommonYear } = require('../utils/year');

/**
 * { studentId → year } for the given students, from this semester's enrolments in `programName`'s
 * modules. Students with no such enrolments are left out of the map.
 */
async function yearsFromEnrolments(studentIds, programName, term) {
  if (!studentIds.length || !programName) return new Map();
  const academicSession = term || (await currentAcademicSession());
  const rows = await prisma.enrollment.findMany({
    where: { studentId: { in: studentIds }, academicSession, module: { curriculum: { some: { program: { name: programName } } } } },
    select: { studentId: true, module: { select: { curriculum: { where: { program: { name: programName } }, select: { year: true } } } } },
  });
  const per = new Map();
  for (const r of rows) for (const c of r.module.curriculum) per.set(r.studentId, [...(per.get(r.studentId) || []), c.year]);
  return new Map([...per].map(([id, ys]) => [id, mostCommonYear(ys)]));
}

/** IDs of students enrolled this semester in any module of the programme. */
async function enrolledInProgramme(programName, term) {
  const academicSession = term || (await currentAcademicSession());
  const rows = await prisma.enrollment.findMany({
    where: { academicSession, module: { curriculum: { some: { program: { name: programName } } } }, student: { role: 'student' } },
    select: { studentId: true }, distinct: ['studentId'],
  });
  return rows.map((r) => r.studentId);
}

/** After an enrolment: save the year worked out from enrolments to the student's profile. */
async function syncStudentYear(studentId) {
  const u = await prisma.user.findUnique({ where: { id: studentId }, select: { programme: true, year: true, role: true } });
  if (!u || u.role !== 'student' || !u.programme) return null;
  const y = (await yearsFromEnrolments([studentId], u.programme)).get(studentId);
  if (y && y !== u.year) await prisma.user.update({ where: { id: studentId }, data: { year: y } });
  return y ?? u.year;
}

module.exports = { yearsFromEnrolments, enrolledInProgramme, syncStudentYear };
