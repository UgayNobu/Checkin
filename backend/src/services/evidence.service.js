// ─────────────────────────────────────────────────────────────
// Evidence documents: a student uploads ONE medical or official
// leave document for a day. Every tutor who teaches any module the
// student is enrolled in can VIEW it. Only MANAGEMENT can approve
// or reject. Approving makes every session of every enrolled module
// on that day Present for the student.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { saveFile, fileUrl } = require('../lib/storage');
const { cap } = require('../utils/format');
const { BadRequest, Forbidden, NotFound, Conflict } = require('../utils/errors');
const { notify } = require('./notifications.service');
const { writeAuditLog } = require('./audit.service');

const include = { student: true, module: true, reviewer: true };

/* ---------- Helpers ---------- */

// Modules a student is enrolled in: [{ id, code }]
async function studentModules(studentId) {
  const rows = await prisma.enrollment.findMany({
    where: { studentId },
    select: { module: { select: { id: true, code: true } } },
  });
  return rows.map((r) => r.module);
}

// Module ids a tutor teaches
async function tutorModuleIds(tutorId) {
  const secs = await prisma.section.findMany({ where: { tutorId }, select: { moduleId: true } });
  return [...new Set(secs.map((s) => s.moduleId))];
}

// Does this tutor teach any module this student is enrolled in?
async function teachesStudent(tutorId, studentId) {
  const ids = await tutorModuleIds(tutorId);
  if (!ids.length) return false;
  return !!(await prisma.enrollment.findFirst({ where: { studentId, moduleId: { in: ids } } }));
}

async function toApi(r) {
  const mods = await studentModules(r.studentId);
  return {
    _id: r.id, type: (r.leaveType || '').toLowerCase(), date: r.date, reason: r.reason,
    fileUrl: await fileUrl(r.documentUrl), fileName: r.originalFilename, status: r.status.toLowerCase(),
    createdAt: r.createdAt, reviewedAt: r.reviewedAt, reviewer: r.reviewer ? { userId: r.reviewer.id, name: r.reviewer.name } : null,
    student: { userId: r.student.id, name: r.student.name },
    // One request covers all enrolled modules; shown as a list of codes.
    module: { id: r.moduleId, name: 'All enrolled modules', code: mods.map((m) => m.code).join(', ') },
  };
}

/** Who may SEE a request. */
async function canSee(user, r) {
  if (user.role === 'student') return r.studentId === user.id;
  if (user.role === 'teacher') return teachesStudent(user.id, r.studentId);
  return user.role === 'admin' || user.role === 'management';
}

/** Who may APPROVE / REJECT a request. Management only. */
const canDecide = (user) => user.role === 'management';

/* ---------- Actions ---------- */

/** A student submits ONE leave request for a day. */
async function submit(student, { date, type, reason }, file) {
  if (!date) throw BadRequest('Please choose the date', 'DATE_REQUIRED');
  const day = new Date(String(date).slice(0, 10));
  if (Number.isNaN(day.getTime())) throw BadRequest('That date is not valid', 'BAD_DATE');
  if (day.getTime() > Date.now()) throw BadRequest('The date cannot be in the future', 'FUTURE_DATE');

  const mods = await studentModules(student.id);
  if (!mods.length) throw BadRequest('You are not enrolled in any module yet. Enrol first in Settings.', 'NOT_ENROLLED');

  const dup = await prisma.evidenceDocument.findFirst({
    where: { studentId: student.id, date: day, status: { in: ['Pending', 'Approved'] } },
  });
  if (dup) throw Conflict('You already sent a request for that date', 'DUPLICATE_REQUEST');

  const stored = file ? await saveFile(file, `evidence/${student.id}`) : null;
  const r = await prisma.evidenceDocument.create({
    data: {
      studentId: student.id,
      moduleId: mods[0].id, // the table needs a module; visibility uses ALL enrolled modules
      date: day,
      reason,
      leaveType: type === 'official' ? 'Official' : 'Medical',
      documentUrl: stored,
      originalFilename: file?.originalname ?? null,
    },
    include,
  });

  // Tell every tutor of the student's modules (each tutor once)
  const secs = await prisma.section.findMany({
    where: { moduleId: { in: mods.map((m) => m.id) } },
    select: { tutorId: true },
  });
  const label = type === 'official' ? 'official' : 'medical';
  for (const tutorId of new Set(secs.map((s) => s.tutorId))) {
    await notify(tutorId, `${student.name} sent a ${label} absence request for ${day.toISOString().slice(0, 10)}.`, 'Evidence Documents');
  }

  return toApi(r);
}

async function listMine(studentId) {
  const rows = await prisma.evidenceDocument.findMany({ where: { studentId }, include, orderBy: { createdAt: 'desc' } });
  return Promise.all(rows.map(toApi));
}

/** Staff list: teachers see requests from students in their modules; admin + management see all. */
async function listForStaff(user, { status }) {
  const where = { ...(status && { status: cap(status) }) };

  if (user.role === 'teacher') {
    const ids = await tutorModuleIds(user.id);
    if (!ids.length) return [];
    const en = await prisma.enrollment.findMany({ where: { moduleId: { in: ids } }, select: { studentId: true } });
    where.studentId = { in: [...new Set(en.map((e) => e.studentId))] };
  }

  const rows = await prisma.evidenceDocument.findMany({ where, include, orderBy: { createdAt: 'desc' } });
  return Promise.all(rows.map(toApi));
}

async function getOne(user, id) {
  const r = await prisma.evidenceDocument.findUnique({ where: { id }, include });
  if (!r) throw NotFound('Request not found');
  if (!(await canSee(user, r))) throw Forbidden();
  return toApi(r);
}

/** Approve or reject: management only. */
async function review(user, id, { status, note }) {
  if (!canDecide(user)) throw Forbidden('Only management can approve or reject requests', 'MANAGEMENT_ONLY');

  const r = await prisma.evidenceDocument.findUnique({ where: { id }, include });
  if (!r) throw NotFound('Request not found');
  if (r.status !== 'Pending') throw Conflict(`This request was already ${r.status.toLowerCase()}`, 'ALREADY_REVIEWED');

  const approved = status === 'approved';
  const ops = [prisma.evidenceDocument.update({ where: { id }, data: { status: cap(status), reviewedBy: user.id, reviewedAt: new Date() } })];

  if (approved) {
    // Every session of every enrolled module on that date → Present.
    const mods = await studentModules(r.studentId);
    const sessions = await prisma.classSession.findMany({
      where: { date: r.date, section: { moduleId: { in: mods.map((m) => m.id) } } },
      select: { id: true },
    });
    for (const se of sessions) {
      ops.push(prisma.attendance.upsert({
        where: { studentId_sessionId: { studentId: r.studentId, sessionId: se.id } },
        update: { status: 'Present', flagReason: 'evidence_approved' },
        create: { studentId: r.studentId, sessionId: se.id, status: 'Present', flagReason: 'evidence_approved' },
      }));
    }
  }
  await prisma.$transaction(ops); // all-or-nothing

  const day = r.date.toISOString().slice(0, 10);
  await notify(r.studentId, `Your absence request for ${day} was ${status}.${note ? ` Note: ${note}` : ''}`, 'Evidence Documents', { email: `Absence request ${status}` });
  await writeAuditLog(user.id, approved ? 'Evidence approved' : 'Evidence rejected', `${r.student.name} (${r.studentId}) ${day}`);
  return { _id: r.id, status };
}

module.exports = { submit, listMine, listForStaff, getOne, review };