// Tutor-side module management: enrolment key and the student list.
const { prisma } = require('../lib/prisma');
const { NotFound, Forbidden, Conflict, BadRequest } = require('../utils/errors');
const { notify } = require('./notifications.service');
const { writeAuditLog } = require('./audit.service');
const { suggestEnrolmentKey, normalizeEnrolmentKey } = require('../utils/enrolment-key');

/** The tutor's section for a module, or a 403. Every tutor route goes through this. */
async function assertTutorOwnsModule(moduleId, tutorId) {
  const sec = await prisma.section.findFirst({ where: { moduleId, tutorId } });
  if (!sec) throw Forbidden('This is not your module', 'NOT_YOUR_MODULE');
  return sec;
}

/**
 * VLE-style enrolment settings. Body may hold either or both:
 *   key       – the module's enrolment key (unique, not case-sensitive); '' removes it
 *   selfEnrol – true/false: whether students may join with the key themselves
 */
async function setEnrolmentKey(moduleId, tutorId, { key, selfEnrol }) {
  await assertTutorOwnsModule(moduleId, tutorId);
  const data = {};
  if (key !== undefined) {
    const k = key ? normalizeEnrolmentKey(key) : null;
    if (k && await prisma.module.findFirst({ where: { enrolmentKey: { equals: k, mode: 'insensitive' }, NOT: { id: moduleId } } }))
      throw Conflict('This key is already used by another module. Please choose a different one.', 'KEY_TAKEN');
    data.enrolmentKey = k;
  }
  if (selfEnrol !== undefined) data.selfEnrol = selfEnrol;
  const m = await prisma.module.update({ where: { id: moduleId }, data });
  return { id: m.id, code: m.code, enrolmentKey: m.enrolmentKey, selfEnrol: m.selfEnrol };
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

/** Unenrol a student: the module's tutor, or an admin. The student is notified. */
async function removeStudent(moduleId, user, studentId) {
  if (user.role === 'teacher') await assertTutorOwnsModule(moduleId, user.id);
  const m = await prisma.module.findUnique({ where: { id: moduleId } });
  if (!m) throw NotFound('Module not found');
  const r = await prisma.enrollment.deleteMany({ where: { moduleId, studentId } });
  if (!r.count) throw BadRequest('That student is not enrolled in this module', 'NOT_ENROLLED');
  await notify(studentId, `You were removed from ${m.code} - ${m.name}.`, 'System');
  if (user.role === 'admin') await writeAuditLog(user.id, 'Student Unenrolled', `${studentId} from ${m.code}`);
  return { message: 'Student removed from the module' };
}

module.exports = { assertTutorOwnsModule, setEnrolmentKey, suggestKey, listStudents, addStudent, removeStudent };
