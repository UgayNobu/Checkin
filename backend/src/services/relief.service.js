// ─────────────────────────────────────────────────────────────
// Relief / evidence requests: a student uploads a medical or official
// leave document for a missed day. When a tutor (for their module),
// admin or management approves it, every session of that module on
// that day becomes Present for the student.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { saveFile, fileUrl } = require('../lib/storage');
const { cap } = require('../utils/format');
const { BadRequest, Forbidden, NotFound, Conflict } = require('../utils/errors');
const { notify } = require('./notifications.service');
const { writeAuditLog } = require('./audit.service');

const include = { student: true, module: { include: { sections: true } }, reviewer: true };

async function toApi(r) {
  return {
    _id: r.id, type: (r.leaveType || '').toLowerCase(), date: r.date, reason: r.reason,
    fileUrl: await fileUrl(r.documentUrl), fileName: r.originalFilename, status: r.status.toLowerCase(),
    createdAt: r.createdAt, reviewedAt: r.reviewedAt, reviewer: r.reviewer ? { userId: r.reviewer.id, name: r.reviewer.name } : null,
    student: { userId: r.student.id, name: r.student.name }, module: { id: r.moduleId, name: r.module.name, code: r.module.code },
  };
}

/** Who may see / decide a request. */
function canSee(user, r) {
  if (user.role === 'student') return r.studentId === user.id;
  if (user.role === 'teacher') return r.module.sections.some((s) => s.tutorId === user.id);
  return user.role === 'admin' || user.role === 'management';
}

async function submit(student, { module, date, type, reason }, file) {
  const enrolled = await prisma.enrollment.findUnique({ where: { studentId_moduleId: { studentId: student.id, moduleId: module } } });
  if (!enrolled) throw Forbidden('You are not enrolled in that module', 'NOT_ENROLLED');
  const day = new Date(date.slice(0, 10));
  if (day.getTime() > Date.now()) throw BadRequest('The date you missed cannot be in the future', 'FUTURE_DATE');
  const dup = await prisma.evidenceDocument.findFirst({ where: { studentId: student.id, moduleId: module, date: day, status: { in: ['Pending', 'Approved'] } } });
  if (dup) throw Conflict('You already sent a request for that module and date', 'DUPLICATE_REQUEST');

  const stored = file ? await saveFile(file, `relief/${student.id}`) : null;
  const r = await prisma.evidenceDocument.create({
    data: {
      studentId: student.id, moduleId: module, date: day, reason, leaveType: type === 'official' ? 'Official' : 'Medical',
      documentUrl: stored, originalFilename: file?.originalname ?? null,
    },
    include,
  });
  // Tell the module's tutor(s) there's something to review.
  for (const s of r.module.sections) await notify(s.tutorId, `${student.name} sent a ${type} absence request for ${r.module.code}.`, 'Evidence Documents');
  return toApi(r);
}

async function listMine(studentId) {
  const rows = await prisma.evidenceDocument.findMany({ where: { studentId }, include, orderBy: { createdAt: 'desc' } });
  return Promise.all(rows.map(toApi));
}

/** Staff list: teachers see their modules only; admin + management see all. */
async function listForStaff(user, { status }) {
  const where = {
    ...(status && { status: cap(status) }),
    ...(user.role === 'teacher' && { module: { sections: { some: { tutorId: user.id } } } }),
  };
  const rows = await prisma.evidenceDocument.findMany({ where, include, orderBy: { createdAt: 'desc' } });
  return Promise.all(rows.map(toApi));
}

async function getOne(user, id) {
  const r = await prisma.evidenceDocument.findUnique({ where: { id }, include });
  if (!r) throw NotFound('Request not found');
  if (!canSee(user, r)) throw Forbidden();
  return toApi(r);
}

async function review(user, id, { status, note }) {
  const r = await prisma.evidenceDocument.findUnique({ where: { id }, include });
  if (!r) throw NotFound('Request not found');
  if (!canSee(user, r)) throw Forbidden('You can only review requests for your own modules', 'NOT_YOUR_MODULE');
  if (r.status !== 'Pending') throw Conflict(`This request was already ${r.status.toLowerCase()}`, 'ALREADY_REVIEWED');

  const approved = status === 'approved';
  const ops = [prisma.evidenceDocument.update({ where: { id }, data: { status: cap(status), reviewedBy: user.id, reviewedAt: new Date() } })];
  if (approved) {
    // Leave relief: every session of this module on that date → Present.
    const sessions = await prisma.classSession.findMany({ where: { date: r.date, section: { moduleId: r.moduleId } }, select: { id: true } });
    for (const se of sessions) {
      ops.push(prisma.attendance.upsert({
        where: { studentId_sessionId: { studentId: r.studentId, sessionId: se.id } },
        update: { status: 'Present', flagReason: 'relief_approved' },
        create: { studentId: r.studentId, sessionId: se.id, status: 'Present', flagReason: 'relief_approved' },
      }));
    }
  }
  await prisma.$transaction(ops); // all-or-nothing

  const day = r.date.toISOString().slice(0, 10);
  await notify(r.studentId, `Your absence request for ${r.module.code} on ${day} was ${status}.${note ? ` Note: ${note}` : ''}`, 'Evidence Documents', { email: `Absence request ${status}` });
  if (user.role !== 'teacher') await writeAuditLog(user.id, approved ? 'Relief approved' : 'Relief rejected', `${r.student.name} (${r.studentId}) ${r.module.code} ${day}`);
  return { _id: r.id, status };
}

module.exports = { submit, listMine, listForStaff, getOne, review };
