// Tutor-side module management: enrolment key and the student list.
const { prisma } = require('../lib/prisma');
const { NotFound, Forbidden } = require('../utils/errors');
const { suggestEnrolmentKey, normalizeEnrolmentKey } = require('../utils/enrolment-key');

/** The tutor's section for a module, or a 403. Every tutor route goes through this. */
async function assertTutorOwnsModule(moduleId, tutorId) {
  const sec = await prisma.section.findFirst({ where: { moduleId, tutorId } });
  if (!sec) throw Forbidden('This is not your module', 'NOT_YOUR_MODULE');
  return sec;
}

async function setEnrolmentKey(moduleId, tutorId, key) {
  await assertTutorOwnsModule(moduleId, tutorId);
  const k = normalizeEnrolmentKey(key);
  const clash = await prisma.module.findFirst({ where: { enrolmentKey: { equals: k, mode: 'insensitive' }, NOT: { id: moduleId } } });
  if (clash) throw Forbidden('Another module already uses that key. Pick a different one.', 'KEY_TAKEN');
  const m = await prisma.module.update({ where: { id: moduleId }, data: { enrolmentKey: k } });
  return { id: m.id, code: m.code, enrolmentKey: m.enrolmentKey };
}

async function suggestKey(moduleId, tutorId) {
  await assertTutorOwnsModule(moduleId, tutorId);
  const m = await prisma.module.findUniqueOrThrow({ where: { id: moduleId } });
  return { key: suggestEnrolmentKey(m.code, m.year, m.semester) };
}

/** Teachers see their own modules; admin and management see any. */
async function listStudents(moduleId, user) {
  if (user.role === 'teacher') await assertTutorOwnsModule(moduleId, user.id);
  const rows = await prisma.enrollment.findMany({ where: { moduleId }, include: { student: true }, orderBy: { enrolledDate: 'asc' } });
  return rows.map((e) => ({ student: { userId: e.student.id, name: e.student.name }, date: e.enrolledDate }));
}

async function addStudent(moduleId, tutorId, userId) {
  await assertTutorOwnsModule(moduleId, tutorId);
  const u = await prisma.user.findFirst({ where: { id: { in: [userId, userId.toUpperCase()] }, role: 'student' } });
  if (!u) throw NotFound('Student not found');
  // upsert with update:{} = "add if missing, do nothing if already there"
  await prisma.enrollment.upsert({ where: { studentId_moduleId: { studentId: u.id, moduleId } }, update: {}, create: { studentId: u.id, moduleId } });
  return { message: 'Student added' };
}

async function removeStudent(moduleId, tutorId, studentId) {
  await assertTutorOwnsModule(moduleId, tutorId);
  await prisma.enrollment.deleteMany({ where: { moduleId, studentId } });
  return { message: 'Student removed' };
}

module.exports = { assertTutorOwnsModule, setEnrolmentKey, suggestKey, listStudents, addStudent, removeStudent };
