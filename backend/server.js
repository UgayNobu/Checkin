require('dotenv').config();
const express = require('express'), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), cors = require('cors'), multer = require('multer'), path = require('path');
const { PrismaClient } = require('@prisma/client');
const helmet = require('helmet'), { rateLimit } = require('express-rate-limit'), PDFDocument = require('pdfkit');
const prisma = new PrismaClient(), app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }), rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use(cors(), express.json()); app.use('/uploads', express.static('uploads'));
const upload = multer({ storage: multer.diskStorage({ destination: 'uploads/', filename: (q, f, cb) => cb(null, Date.now() + path.extname(f.originalname)) }), limits: { fileSize: 10 * 1024 * 1024 } });
const REQUIRED_PCT = +process.env.REQUIRED_ATTENDANCE_PERCENT || 90, ACCURACY_MAX = +process.env.ACCURACY_FLAG_METRES || 50;
const RADIUS = +process.env.GEOFENCE_METRES || 10, OK = ['Present', 'Late'];
 
// ---------- helpers ----------
const wrap = (f) => (q, s, n) => f(q, s, n).catch((e) => s.status(400).json({ error: e.code === 'P2002' ? 'That ID, email or record already exists' : e.message }));
const auth = (...roles) => (q, s, n) => {
  try { q.user = jwt.verify((q.headers.authorization || '').slice(7), process.env.JWT_SECRET); } catch { return s.status(401).json({ error: 'Please log in' }); }
  if (roles.length && !roles.includes(q.user.role)) return s.status(403).json({ error: 'Not allowed for your role' }); n();
};
const roleOut = (r) => (r === 'tutor' ? 'teacher' : r), roleIn = (r) => (r === 'teacher' ? 'tutor' : r), cap = (x) => x[0].toUpperCase() + x.slice(1);
const apiStatus = (x) => (OK.includes(x) ? 'present' : ['Flagged', 'Pending review'].includes(x) ? 'flagged' : 'absent');
const haversine = (a, b, c, d) => { const r = (x) => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(h)); };
const at = (x) => new Date(x.date.toISOString().slice(0, 10) + 'T' + x.startTime.toISOString().slice(11, 19) + 'Z'); // date + start_time as one instant
const userOut = (u) => ({ _id: u.id, userId: u.id, name: u.name, email: u.email, phone: u.phone, department: u.department, designation: u.designation, programme: u.programme,
  role: roleOut(u.role), active: u.isActive, createdAt: u.createdAt, avatarUrl: u.avatarUrl || null, prefs: { low: true, evidence: true, reminders: false, email: true, sms: false, push: true, ...(u.prefs || {}) } });
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };
const audit = (adminId, action, details) => prisma.auditLog.create({ data: { adminId, action, details } }).catch(() => {});
const notify = (userId, message, category) => prisma.notification.create({ data: { userId, message, category } }).catch(() => {});
const sessionsOf = (moduleId) => prisma.classSession.findMany({ where: { section: { moduleId } }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }] });
const attended = (studentId, ids) => prisma.attendance.findMany({ where: { studentId, sessionId: { in: ids }, status: { in: OK } }, select: { sessionId: true } });
const pct = async (studentId, moduleId) => { const ses = await sessionsOf(moduleId); return ses.length ? Math.round((await attended(studentId, ses.map((x) => x.id))).length / ses.length * 1000) / 10 : 0; };
const overall = async (studentId) => {
  let t = 0, p = 0;
  for (const e of await prisma.enrollment.findMany({ where: { studentId }, select: { moduleId: true } })) { const ses = await sessionsOf(e.moduleId); t += ses.length; p += (await attended(studentId, ses.map((x) => x.id))).length; }
  return t ? Math.round(p / t * 100) : 0;
};
const mine = (moduleId, tutorId) => prisma.section.findFirst({ where: { moduleId, tutorId } });
const monthDays = async (studentId, moduleIds, month) => {
  const [y, mo] = month.split('-').map(Number), out = {};
  const ses = await prisma.classSession.findMany({ where: { section: { moduleId: { in: moduleIds } }, date: { gte: new Date(Date.UTC(y, mo - 1, 1)), lt: new Date(Date.UTC(y, mo, 1)) } } });
  const att = await prisma.attendance.findMany({ where: { studentId, sessionId: { in: ses.map((x) => x.id) } } });
  for (const x of ses) { const r = att.find((t) => t.sessionId === x.id), st = r ? apiStatus(r.status) : 'absent', d = x.date.getUTCDate();
    if (!out[d] || st === 'present' || (st === 'flagged' && out[d] === 'absent')) out[d] = st; }
  return out;
};
 
// ---------- Auth & profile ----------
app.post('/api/auth/register', wrap(async (q, s) => {
  const { userId, name, email, password, role = 'student', programme, department } = q.body;
  if (!['student', 'teacher'].includes(role)) throw Error('Invalid role');
  if (!userId || !email || !password) throw Error('ID, email and password are required');
  await prisma.user.create({ data: { id: userId, name, email, passwordHash: await bcrypt.hash(password, 10), role: roleIn(role), programme, isActive: role === 'student',
    department: department || (programme || '').replace(/^BE /, '') || null, year: role === 'student' ? 1 : null } });
  s.json({ message: role === 'teacher' ? 'Request submitted. An admin will approve your account.' : 'Account created' });
}));
app.post('/api/auth/login', wrap(async (q, s) => {
  const u = await prisma.user.findUnique({ where: { id: String(q.body.userId || '') } });
  if (!u || !u.passwordHash || !(await bcrypt.compare(q.body.password || '', u.passwordHash))) throw Error('Wrong ID or password');
  if (!u.isActive) throw Error('Account is not active');
  s.json({ token: jwt.sign({ id: u.id, role: roleOut(u.role) }, process.env.JWT_SECRET, { expiresIn: '8h' }), user: { name: u.name, userId: u.id, role: roleOut(u.role) } });
}));
app.get('/api/me', auth(), wrap(async (q, s) => {
  const u = await prisma.user.findUnique({ where: { id: q.user.id } });
  s.json(userOut(u));
}));
app.put('/api/me', auth(), wrap(async (q, s) => {
  const { name, email, phone, prefs } = q.body, u = await prisma.user.findUnique({ where: { id: q.user.id } });
  const data = Object.fromEntries(Object.entries({ name, email, phone }).filter(([, v]) => v !== undefined));
  if (prefs) data.prefs = { ...(u.prefs || {}), ...prefs };
  s.json(userOut(await prisma.user.update({ where: { id: q.user.id }, data })));
}));
app.put('/api/me/password', auth(), wrap(async (q, s) => {
  const u = await prisma.user.findUnique({ where: { id: q.user.id } }), { current, next } = q.body;
  if (!(await bcrypt.compare(current || '', u.passwordHash))) throw Error('Current password is wrong');
  if (!/.{8,}/.test(next) || !/\d/.test(next) || !/[^\w\s]/.test(next)) throw Error('Password needs 8+ characters, a number and a symbol');
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(next, 10) } }); s.json({ message: 'Password updated' });
}));
app.get('/api/notifications', auth(), wrap(async (q, s) => s.json(await prisma.notification.findMany({ where: { userId: q.user.id }, orderBy: { createdAt: 'desc' }, take: 50 }))));
app.put('/api/notifications/:id/read', auth(), wrap(async (q, s) => { await prisma.notification.updateMany({ where: { id: q.params.id, userId: q.user.id }, data: { isRead: true } }); s.json({ ok: true }); }));
 
// ---------- Student ----------
app.get('/api/student/dashboard', auth('student'), wrap(async (q, s) => {
  const en = await prisma.enrollment.findMany({ where: { studentId: q.user.id }, include: { module: true } });
  s.json(await Promise.all(en.map(async (e) => ({ id: e.moduleId, name: e.module.name, code: e.module.code, pct: await pct(q.user.id, e.moduleId) }))));
}));
app.get('/api/student/summary', auth('student'), wrap(async (q, s) => {
  let t = 0, p = 0;
  for (const e of await prisma.enrollment.findMany({ where: { studentId: q.user.id } })) { const ses = await sessionsOf(e.moduleId); t += ses.length; p += (await attended(q.user.id, ses.map((x) => x.id))).length; }
  s.json({ rate: t ? Math.round(p / t * 100) : 0, absences: t - p });
}));
app.get('/api/student/modules/:id/records', auth('student'), wrap(async (q, s) => {
  const ses = await sessionsOf(q.params.id), got = new Set((await attended(q.user.id, ses.map((x) => x.id))).map((a) => a.sessionId));
  const rows = ses.map((x) => ({ date: at(x), hours: x.duration / 60, type: x.sessionType, status: got.has(x.id) ? 'present' : 'absent' })).reverse();
  const part = (t) => { const l = rows.filter((r) => r.type === t); return { rows: l, pct: l.length ? Math.round(l.filter((r) => r.status === 'present').length / l.length * 100) : 0 }; };
  s.json({ theory: part('theory'), practical: part('practical') });
}));
app.get('/api/modules/browse', auth('student'), wrap(async (q, s) => {
  const mineIds = new Set((await prisma.enrollment.findMany({ where: { studentId: q.user.id }, select: { moduleId: true } })).map((e) => e.moduleId));
  const l = await prisma.module.findMany({ include: { program: true, sections: { take: 1 }, _count: { select: { enrollments: true } } }, orderBy: { code: 'asc' } });
  s.json(l.map((m) => ({ id: m.id, name: m.name, code: m.code, year: m.year, semester: m.semester, department: m.program.name, section: m.sections[0]?.name, students: m._count.enrollments, selfEnrol: m.selfEnrol, enrolled: mineIds.has(m.id) })));
}));
app.post('/api/modules/enrol', auth('student'), wrap(async (q, s) => {
  const key = String(q.body.key || '').trim(); if (!key) throw Error('Please enter the enrolment key');
  const m = q.body.module ? await prisma.module.findUnique({ where: { id: String(q.body.module) } })
    : await prisma.module.findFirst({ where: { enrolmentKey: { equals: key, mode: 'insensitive' } } });
  if (!m) throw Error(q.body.module ? 'Module not found' : 'Enrolment key not found');
  if (!m.selfEnrol) throw Error('Self-enrolment is closed for this module. Ask your tutor to add you.');
  if (!m.enrolmentKey || m.enrolmentKey.toLowerCase() !== key.toLowerCase()) throw Error('Wrong enrolment key for this module');
  if (await prisma.enrollment.findUnique({ where: { studentId_moduleId: { studentId: q.user.id, moduleId: m.id } } })) throw Error('Already enrolled');
  await prisma.enrollment.create({ data: { studentId: q.user.id, moduleId: m.id } }); s.json({ message: `Joined ${m.name}` });
}));
app.post('/api/attendance/checkin', auth('student'), wrap(async (q, s) => {
  const { code, lat, lng, accuracy, permissionDenied } = q.body;
  const c = await prisma.attendanceCode.findFirst({ where: { code: String(code || '').toUpperCase(), expiryTimestamp: { gt: new Date() } }, include: { session: { include: { section: { include: { module: true } } } } } });
  if (!c) throw Error('Code is invalid or has expired');
  if (c.session.status === 'ended') throw Error('This session has ended');
  const sec = c.session.section, m = sec.module, id = q.user.id;
  if (!(await prisma.enrollment.findUnique({ where: { studentId_moduleId: { studentId: id, moduleId: m.id } } }))) throw Error('You are not enrolled in this module');
  if (await prisma.attendance.findUnique({ where: { studentId_sessionId: { studentId: id, sessionId: c.sessionId } } })) throw Error('Already checked in');
  let flagReason = null, distance = null;
  if (permissionDenied || lat == null || lng == null || lat === '' || lng === '') flagReason = 'permission_denied';
  else { distance = Math.round(haversine(+lat, +lng, c.latitude, c.longitude) * 10) / 10;
    if (distance > c.geofenceRadius) flagReason = 'outside_radius'; else if (accuracy != null && +accuracy > ACCURACY_MAX) flagReason = 'low_accuracy'; }
  const ok = !flagReason;
  await prisma.attendance.create({ data: { studentId: id, sessionId: c.sessionId, status: ok ? 'Present' : 'Flagged', flagReason, distanceMeters: distance,
    submittedLat: distance == null ? null : +lat, submittedLng: distance == null ? null : +lng, accuracy: accuracy == null || accuracy === '' ? null : +accuracy } });
  if (!ok) { const u = await prisma.user.findUnique({ where: { id } });
    const why = flagReason === 'outside_radius' ? `${Math.round(distance)} m from the classroom` : flagReason === 'low_accuracy' ? `with weak GPS accuracy (${Math.round(accuracy)} m)` : 'without sharing location';
    await notify(sec.tutorId, `${u.name} checked in ${why} (${m.code}). Please verify.`, 'Attendance'); }
  s.json({ status: ok ? 'present' : 'flagged', flagReason, distance, message: ok ? `Present in ${m.name}` : 'Checked in, but your location could not be confirmed. Your tutor will review it.' });
}));
app.get('/api/attendance/me', auth('student'), wrap(async (q, s) => {
  const en = await prisma.enrollment.findMany({ where: { studentId: q.user.id }, select: { moduleId: true } });
  s.json(await monthDays(q.user.id, en.map((e) => e.moduleId), q.query.month));
}));
app.post('/api/evidence', auth('student'), upload.single('file'), wrap(async (q, s) => {
  const { type, date, reason, module } = q.body; if (!module) throw Error('Please choose a module'); if (!date) throw Error('Please choose the date you missed');
  const r = await prisma.evidenceDocument.create({ data: { studentId: q.user.id, moduleId: module, date: new Date(date), reason, leaveType: type === 'official' ? 'Official' : 'Medical', documentUrl: q.file ? '/uploads/' + q.file.filename : null, originalFilename: q.file ? q.file.originalname : null } });
  s.json({ _id: r.id });
}));
app.get('/api/evidence/mine', auth('student'), wrap(async (q, s) => {
  const l = await prisma.evidenceDocument.findMany({ where: { studentId: q.user.id }, include: { module: true, student: true }, orderBy: { createdAt: 'desc' } });
  s.json(l.map((r) => ({ _id: r.id, type: (r.leaveType || '').toLowerCase(), date: r.date, reason: r.reason, fileUrl: r.documentUrl, status: r.status.toLowerCase(),
    student: { name: r.student.name, userId: r.student.id }, module: { name: r.module.name, code: r.module.code } })));
}));
 
// ---------- Teacher (role "tutor" in the database) ----------
app.get('/api/teacher/modules', auth('teacher'), wrap(async (q, s) => {
  const secs = await prisma.section.findMany({ where: { tutorId: q.user.id }, include: { module: true } }), seen = new Set(), out = [];
  for (const x of secs) { if (seen.has(x.moduleId)) continue; seen.add(x.moduleId);
    out.push({ id: x.moduleId, name: x.module.name, code: x.module.code, section: x.name, students: await prisma.enrollment.count({ where: { moduleId: x.moduleId } }), enrolmentKey: x.module.enrolmentKey, selfEnrol: x.module.selfEnrol }); }
  s.json(out);
}));
app.put('/api/modules/:id/key', auth('teacher'), wrap(async (q, s) => {
  if (!(await mine(q.params.id, q.user.id))) throw Error('This is not your module');
  const data = {};
  if (q.body.key !== undefined) {
    const key = String(q.body.key || '').trim() || null;
    if (key && await prisma.module.findFirst({ where: { enrolmentKey: { equals: key, mode: 'insensitive' }, NOT: { id: q.params.id } } }))
      throw Error('This key is already used by another module. Please choose a different one.');
    data.enrolmentKey = key;
  }
  if (typeof q.body.selfEnrol === 'boolean') data.selfEnrol = q.body.selfEnrol;
  const m = await prisma.module.update({ where: { id: q.params.id }, data });
  s.json({ id: m.id, enrolmentKey: m.enrolmentKey, selfEnrol: m.selfEnrol });
}));
app.get('/api/modules/:id/students', auth('teacher', 'admin', 'management'), wrap(async (q, s) => {
  const l = await prisma.enrollment.findMany({ where: { moduleId: q.params.id }, include: { student: true }, orderBy: { enrolledDate: 'asc' } });
  s.json(l.map((e) => ({ student: { userId: e.student.id, name: e.student.name }, date: e.enrolledDate })));
}));
app.post('/api/modules/:id/students', auth('teacher'), wrap(async (q, s) => {
  if (!(await mine(q.params.id, q.user.id))) throw Error('This is not your module');
  const u = await prisma.user.findFirst({ where: { id: q.body.userId, role: 'student' } }); if (!u) throw Error('Student not found');
  await prisma.enrollment.upsert({ where: { studentId_moduleId: { studentId: u.id, moduleId: q.params.id } }, update: {}, create: { studentId: u.id, moduleId: q.params.id } }); s.json({ message: 'Student added' });
}));
app.post('/api/sessions', auth('teacher'), wrap(async (q, s) => {
  const { module, room, type, hours, lat, lng, minutes = 10 } = q.body, sec = await mine(module, q.user.id); if (!sec) throw Error('This is not your module');
  if (room && room !== sec.room) await prisma.section.update({ where: { id: sec.id }, data: { room } });
  const now = new Date(), code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const se = await prisma.classSession.create({ data: { sectionId: sec.id, date: now, startTime: now, duration: Math.round((+hours || 1) * 60), sessionType: type, status: 'ongoing',
    codes: { create: { code, expiryTimestamp: new Date(Date.now() + minutes * 60000), geofenceRadius: RADIUS, latitude: +lat, longitude: +lng } } } });
  s.json({ _id: se.id, code });
}));
app.get('/api/sessions/:id/live', auth('teacher'), wrap(async (q, s) => {
  const se = await prisma.classSession.findUnique({ where: { id: q.params.id }, include: { codes: true, section: true } }); if (!se || se.section.tutorId !== q.user.id) throw Error('Session not found');
  const total = await prisma.enrollment.count({ where: { moduleId: se.section.moduleId } }), list = await prisma.attendance.findMany({ where: { sessionId: se.id }, include: { student: true } }), c = se.codes[0];
  s.json({ code: c.code, expiresAt: c.expiryTimestamp, total, checkedIn: list.filter((a) => OK.includes(a.status)).length, absent: total - list.length,
    flagged: list.filter((a) => apiStatus(a.status) === 'flagged').map((a) => ({ name: a.student.name })) });
}));
app.get('/api/teacher/records/:moduleId', auth('teacher'), wrap(async (q, s) => {
  if (!(await mine(q.params.moduleId, q.user.id))) throw Error('This is not your module');
  const ses = await sessionsOf(q.params.moduleId), en = await prisma.enrollment.findMany({ where: { moduleId: q.params.moduleId }, include: { student: true } });
  const att = await prisma.attendance.findMany({ where: { sessionId: { in: ses.map((x) => x.id) }, status: { in: OK } } }), ids = (t) => ses.filter((x) => x.sessionType === t).map((x) => x.id);
  const p = (list, sid) => list.length ? Math.round(att.filter((a) => a.studentId === sid && list.includes(a.sessionId)).length / list.length * 100) : 0;
  s.json(en.map(({ student: u }) => ({ id: u.id, userId: u.id, name: u.name, practical: p(ids('practical'), u.id), theory: p(ids('theory'), u.id), total: p(ses.map((x) => x.id), u.id) })));
}));
app.get('/api/teacher/records/:moduleId/:studentId', auth('teacher'), wrap(async (q, s) => {
  if (!(await mine(q.params.moduleId, q.user.id))) throw Error('This is not your module');
  const st = await prisma.user.findUnique({ where: { id: q.params.studentId } }), ses = await sessionsOf(q.params.moduleId), got = new Set((await attended(st.id, ses.map((x) => x.id))).map((a) => a.sessionId)), rows = {};
  for (const x of ses) { const d = x.date.toISOString().slice(0, 10); rows[d] = rows[d] || { date: d }; rows[d][x.sessionType] = got.has(x.id) ? 'present' : 'absent'; }
  s.json({ student: { userId: st.id, name: st.name }, rows: Object.values(rows) });
}));
app.get('/api/teacher/reports', auth('teacher'), wrap(async (q, s) => {
  const out = [], seen = new Set();
  for (const sec of await prisma.section.findMany({ where: { tutorId: q.user.id }, include: { module: true } })) {
    if (seen.has(sec.moduleId)) continue; seen.add(sec.moduleId);
    const ses = await sessionsOf(sec.moduleId), n = await prisma.enrollment.count({ where: { moduleId: sec.moduleId } }), att = await prisma.attendance.findMany({ where: { sessionId: { in: ses.map((x) => x.id) }, status: { in: OK } } });
    const weeks = Array.from({ length: 6 }, (_, i) => { const a = Date.now() - (6 - i) * 6048e5, b = a + 6048e5, set = new Set(ses.filter((x) => at(x) >= a && at(x) < b).map((x) => x.id));
      return set.size && n ? Math.round(att.filter((t) => set.has(t.sessionId)).length / (set.size * n) * 100) : 0; });
    out.push({ code: sec.module.code, name: sec.module.name, weeks, overall: ses.length * n ? Math.round(att.length / (ses.length * n) * 100) : 0 });
  }
  s.json(out);
}));
 
// ---------- Evidence document review (teacher / admin / management) ----------
app.get('/api/evidence', auth('teacher', 'admin', 'management'), wrap(async (q, s) => {
  const where = { ...(q.query.status && { status: cap(q.query.status) }), ...(q.user.role === 'teacher' && { module: { sections: { some: { tutorId: q.user.id } } } }) };
  const l = await prisma.evidenceDocument.findMany({ where, include: { student: true, module: true }, orderBy: { createdAt: 'desc' } });
  s.json(l.map((r) => ({ _id: r.id, student: { name: r.student.name, userId: r.student.id }, module: { name: r.module.name, code: r.module.code }, date: r.date, reason: r.reason, fileUrl: r.documentUrl, status: r.status.toLowerCase() })));
}));
app.patch('/api/evidence/:id', auth('teacher', 'admin', 'management'), wrap(async (q, s) => {
  if (!['approved', 'rejected'].includes(q.body.status)) throw Error('Invalid status');
  const r = await prisma.evidenceDocument.update({ where: { id: q.params.id }, data: { status: cap(q.body.status), reviewedBy: q.user.id, reviewedAt: new Date() } });
  if (q.body.status === 'approved')
    for (const se of await prisma.classSession.findMany({ where: { date: r.date, section: { moduleId: r.moduleId } } }))
      await prisma.attendance.upsert({ where: { studentId_sessionId: { studentId: r.studentId, sessionId: se.id } }, update: { status: 'Present' }, create: { studentId: r.studentId, sessionId: se.id, status: 'Present' } });
  await notify(r.studentId, `Your absence request was ${q.body.status}.`, 'Evidence Documents'); s.json({ _id: r.id, status: q.body.status });
}));
 
// ---------- Admin ----------
app.get('/api/admin/overview', auth('admin', 'management'), wrap(async (q, s) => s.json({
  students: await prisma.user.count({ where: { role: 'student' } }), newStudents: await prisma.user.count({ where: { role: 'student', createdAt: { gte: monthStart() } } }),
  tutors: await prisma.user.count({ where: { role: 'tutor', isActive: true } }), programs: await prisma.program.count(), modules: await prisma.module.count() })));
app.get('/api/admin/programs', auth('admin', 'management'), wrap(async (q, s) => s.json((await prisma.program.findMany({ orderBy: { name: 'asc' } })).map((p) => p.name))));
app.post('/api/admin/programs', auth('admin'), wrap(async (q, s) => { const p = await prisma.program.create({ data: { name: q.body.name } }); await audit(q.user.id, 'Created program', q.body.name); s.json(p); }));
app.put('/api/admin/programs', auth('admin'), wrap(async (q, s) => {
  const { from, to } = q.body; await prisma.program.updateMany({ where: { name: from }, data: { name: to } }); await prisma.user.updateMany({ where: { department: from }, data: { department: to } });
  await audit(q.user.id, 'Renamed program', `${from} -> ${to}`); s.json({ message: 'Renamed' });
}));
app.get('/api/admin/users', auth('admin'), wrap(async (q, s) => {
  const { role = 'student', department, year } = q.query, where = { role: roleIn(role), ...(department && { department }) };
  if (year) where.OR = +year === 1 ? [{ year: 1 }, { year: null }] : [{ year: +year }];
  const u = await prisma.user.findMany({ where, orderBy: { name: 'asc' } });
  s.json(await Promise.all(u.map(async (x) => ({ ...userOut(x), ...(role === 'student' && { pct: await overall(x.id) }) }))));
}));
app.patch('/api/admin/users/:id', auth('admin'), wrap(async (q, s) => {
  const data = {}; if (q.body.active !== undefined) { data.isActive = q.body.active; data.status = q.body.active ? 'active' : 'inactive'; } if (q.body.name) data.name = q.body.name;
  const u = await prisma.user.update({ where: { id: q.params.id }, data }); await audit(q.user.id, q.body.active === undefined ? 'Edited user' : q.body.active ? 'Activated user' : 'Deactivated user', u.id); s.json(userOut(u));
}));
app.get('/api/admin/modules', auth('admin'), wrap(async (q, s) => {
  const { department, year, semester } = q.query;
  const l = await prisma.module.findMany({ where: { ...(department && { program: { name: department } }), ...(year && { year: +year }), ...(semester && { semester: +semester }) }, include: { sections: { include: { tutor: true }, take: 1 } }, orderBy: { code: 'asc' } });
  s.json(l.map((m) => ({ _id: m.id, name: m.name, code: m.code, count: m.moduleCount, tutor: m.sections[0] ? { userId: m.sections[0].tutor.id, name: m.sections[0].tutor.name } : null })));
}));
const saveModule = async (id, b) => {
  let program = await prisma.program.findFirst({ where: { name: b.department } }); if (!program) program = await prisma.program.create({ data: { name: b.department } });
  const data = { name: b.name, code: b.code, programId: program.id, year: +b.year || null, semester: +b.semester || null, moduleCount: +b.count || null };
  const m = id ? await prisma.module.update({ where: { id }, data }) : await prisma.module.create({ data });
  if (b.tutorId) {
    const t = await prisma.user.findFirst({ where: { id: b.tutorId, role: 'tutor' } }); if (!t) throw Error('Tutor not found');
    const sec = await prisma.section.findFirst({ where: { moduleId: m.id } });
    if (sec) await prisma.section.update({ where: { id: sec.id }, data: { tutorId: t.id } }); else await prisma.section.create({ data: { moduleId: m.id, tutorId: t.id, name: 'A' } });
  }
  return m;
};
app.post('/api/admin/modules', auth('admin'), wrap(async (q, s) => { const m = await saveModule(null, q.body); await audit(q.user.id, 'Created module', m.code); s.json({ _id: m.id }); }));
app.put('/api/admin/modules/:id', auth('admin'), wrap(async (q, s) => { const m = await saveModule(q.params.id, q.body); await audit(q.user.id, 'Updated module', m.code); s.json({ _id: m.id }); }));
 
// ---------- Management ----------
const mg = auth('management', 'admin');
const deptStats = async (name) => {
  const mods = await prisma.module.findMany({ where: { program: { name } } }); let exp = 0, pres = 0;
  for (const m of mods) { const ses = await sessionsOf(m.id); exp += ses.length * await prisma.enrollment.count({ where: { moduleId: m.id } });
    pres += await prisma.attendance.count({ where: { sessionId: { in: ses.map((x) => x.id) }, status: { in: OK } } }); }
  return { mods, exp, pres };
};
app.get('/api/management/overview', mg, wrap(async (q, s) => {
  const departments = [];
  for (const p of await prisma.program.findMany({ orderBy: { name: 'asc' } })) { const d = await deptStats(p.name);
    departments.push({ department: p.name, students: await prisma.user.count({ where: { role: 'student', department: p.name } }), modules: d.mods.length, attendance: d.exp ? Math.round(d.pres / d.exp * 1000) / 10 : 0 }); }
  s.json({ totals: { students: await prisma.user.count({ where: { role: 'student' } }), newStudents: await prisma.user.count({ where: { role: 'student', createdAt: { gte: monthStart() } } }),
    tutors: await prisma.user.count({ where: { role: 'tutor', isActive: true } }), modules: await prisma.module.count(), below80: departments.filter((r) => r.attendance < 80).length }, departments });
}));
app.get('/api/management/department/:name', mg, wrap(async (q, s) => {
  const { mods } = await deptStats(q.params.name), size = {};
  for (const m of mods) size[m.id] = await prisma.enrollment.count({ where: { moduleId: m.id } });
  const studs = await prisma.user.findMany({ where: { role: 'student', department: q.params.name }, select: { id: true } }), pcts = await Promise.all(studs.map((u) => overall(u.id)));
  const ses = await prisma.classSession.findMany({ where: { section: { moduleId: { in: mods.map((m) => m.id) } } }, include: { section: true } });
  const att = await prisma.attendance.findMany({ where: { sessionId: { in: ses.map((x) => x.id) }, status: { in: OK } }, select: { sessionId: true } });
  const trend = Array.from({ length: 6 }, (_, i) => { const a = Date.now() - (6 - i) * 6048e5, b = a + 6048e5, w = ses.filter((x) => at(x) >= a && at(x) < b), set = new Set(w.map((x) => x.id));
    const exp = w.reduce((t, x) => t + size[x.section.moduleId], 0); return exp ? Math.round(att.filter((t) => set.has(t.sessionId)).length / exp * 1000) / 10 : 0; });
  s.json({ students: studs.length, avg: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length * 10) / 10 : 0, atRisk: pcts.filter((p) => p < 80).length, trend,
    modules: mods.map((m) => ({ id: m.id, name: m.name, code: m.code, year: m.year })) });
}));
app.get('/api/management/module/:id', mg, wrap(async (q, s) => {
  const m = await prisma.module.findUnique({ where: { id: q.params.id } }), ses = await sessionsOf(m.id), en = await prisma.enrollment.findMany({ where: { moduleId: m.id }, include: { student: true } });
  const att = await prisma.attendance.findMany({ where: { sessionId: { in: ses.map((x) => x.id) }, status: { in: OK } } });
  const rows = en.map(({ student: u }) => { const got = new Set(att.filter((a) => a.studentId === u.id).map((a) => a.sessionId)), missed = ses.filter((x) => !got.has(x.id));
    return { id: u.id, userId: u.id, name: u.name, absences: missed.length, absentH: missed.reduce((t, x) => t + x.duration / 60, 0), pct: ses.length ? Math.round(got.size / ses.length * 1000) / 10 : 0 }; });
  s.json({ module: { name: m.name, code: m.code }, totals: { students: rows.length, absence: rows.reduce((t, r) => t + r.absences, 0), evidence: await prisma.evidenceDocument.count({ where: { moduleId: m.id, status: 'Approved' } }) }, rows });
}));
app.get('/api/management/student/:id', mg, wrap(async (q, s) => {
  const st = await prisma.user.findUnique({ where: { id: q.params.id } }), ses = await sessionsOf(q.query.module), got = new Set((await attended(st.id, ses.map((x) => x.id))).map((a) => a.sessionId));
  const history = ses.map((x) => ({ date: at(x), status: got.has(x.id) ? 'present' : 'absent' })), present = history.filter((h) => h.status === 'present').length;
  s.json({ student: { userId: st.id, name: st.name }, present, absent: history.length - present, total: history.length, pct: history.length ? Math.round(present / history.length * 100) : 0, history });
}));
app.get('/api/management/teachers', mg, wrap(async (q, s) => {
  const rows = [];
  for (const x of await prisma.section.findMany({ include: { module: true, tutor: true, sessions: true } }))
    rows.push({ module: `${x.module.code} – ${x.module.name}`, name: x.tutor.name, cls: x.name, hours: x.sessions.reduce((t, y) => t + y.duration / 60, 0) });
  s.json({ total: await prisma.user.count({ where: { role: 'tutor', isActive: true } }), rows });
}));
app.get('/api/management/history', mg, wrap(async (q, s) => {
  const { q: text, year, semester, department } = q.query, rows = [];
  const mods = await prisma.module.findMany({ where: { ...(year && { year: +year }), ...(semester && { semester: +semester }), ...(department && { program: { name: department } }) },
    include: { enrollments: { include: { student: true } }, sections: { include: { tutor: true }, take: 1 } } });
  for (const m of mods) for (const { student: u } of m.enrollments) {
    if (text && !((u.name || '') + u.id).toLowerCase().includes(text.toLowerCase())) continue;
    rows.push({ sid: u.id, mid: m.id, name: u.name, userId: u.id, module: `${m.code} – ${m.name}`, teacher: m.sections[0]?.tutor.name, pct: await pct(u.id, m.id) });
  }
  s.json(rows);
}));
app.get('/api/management/calendar', mg, wrap(async (q, s) => s.json(await monthDays(q.query.student, [q.query.module], q.query.month))));
 
// =====================================================================
// ---------- Additions from the backend design doc (plain JS) ----------
// Features that neither this server nor the original database had.
// Nothing above was removed; a few handlers above were extended to
// store extra data (check-in GPS details, session status, file name,
// review time, tutor approval status).
// =====================================================================
const AT_RISK_PCT = +process.env.AT_RISK_ATTENDANCE_PERCENT || 80;
const REALERT_DAYS = +process.env.LOW_ATTENDANCE_REALERT_DAYS || 7;
const csvCell = (v) => { const x = v == null ? '' : String(v); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
const sendCsv = (s, name, header, rows) => {
  s.set('Content-Type', 'text/csv; charset=utf-8'); s.set('Content-Disposition', `attachment; filename="${name}"`);
  s.send([header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n'));
};

app.get('/health', (q, s) => s.json({ status: 'ok', service: 'checkin-backend', time: new Date().toISOString() }));

// ---------- Sessions: list, end, live roster, review flagged check-ins ----------
const ownedSession = async (id, tutorId) => {
  const se = await prisma.classSession.findUnique({ where: { id }, include: { section: { include: { module: true } }, codes: true } });
  if (!se || se.section.tutorId !== tutorId) throw Error('Session not found');
  return se;
};
app.get('/api/sessions/mine', auth('teacher'), wrap(async (q, s) => {
  const l = await prisma.classSession.findMany({ where: { section: { tutorId: q.user.id } }, include: { section: { include: { module: true } }, _count: { select: { attendance: true } } },
    orderBy: [{ date: 'desc' }, { startTime: 'desc' }], take: Math.min(+q.query.limit || 50, 200) });
  s.json(l.map((x) => ({ _id: x.id, module: { id: x.section.moduleId, code: x.section.module.code, name: x.section.module.name }, section: x.section.name, room: x.section.room,
    date: at(x), hours: x.duration / 60, type: x.sessionType, status: x.status, checkIns: x._count.attendance })));
}));
app.post('/api/sessions/:id/end', auth('teacher'), wrap(async (q, s) => {
  const se = await ownedSession(q.params.id, q.user.id), now = new Date();
  await prisma.$transaction([
    prisma.classSession.update({ where: { id: se.id }, data: { status: 'ended' } }),
    prisma.attendanceCode.updateMany({ where: { sessionId: se.id, expiryTimestamp: { gt: now } }, data: { expiryTimestamp: now } }),
  ]);
  s.json({ _id: se.id, status: 'ended' });
}));
app.get('/api/sessions/:id/roster', auth('teacher'), wrap(async (q, s) => {
  const se = await ownedSession(q.params.id, q.user.id), c = se.codes[0];
  const en = await prisma.enrollment.findMany({ where: { moduleId: se.section.moduleId }, include: { student: true }, orderBy: { studentId: 'asc' } });
  const att = await prisma.attendance.findMany({ where: { sessionId: se.id } });
  const rows = en.map(({ student: u }) => { const a = att.find((t) => t.studentId === u.id);
    return { attendanceId: a ? a.id : null, userId: u.id, name: u.name, status: a ? apiStatus(a.status) : 'absent', time: a ? a.timestamp : null,
      flagReason: a ? a.flagReason : null, distance: a ? a.distanceMeters : null, accuracy: a ? a.accuracy : null }; });
  const n = (st) => rows.filter((r) => r.status === st).length;
  s.json({ session: { _id: se.id, module: { code: se.section.module.code, name: se.section.module.name }, date: at(se), type: se.sessionType, status: se.status,
    code: c ? c.code : null, expiresAt: c ? c.expiryTimestamp : null }, counts: { enrolled: rows.length, present: n('present'), flagged: n('flagged'), absent: n('absent') }, rows });
}));
const decideFlag = (accept) => wrap(async (q, s) => {
  const se = await ownedSession(q.params.id, q.user.id), a = await prisma.attendance.findUnique({ where: { id: q.params.attendanceId } });
  if (!a || a.sessionId !== se.id) throw Error('Check-in not found');
  if (apiStatus(a.status) !== 'flagged') throw Error('This check-in is not flagged');
  const note = String((q.body && q.body.note) || '').trim(), flagReason = note ? `${a.flagReason || 'reviewed'} - ${note}`.slice(0, 100) : a.flagReason;
  await prisma.attendance.update({ where: { id: a.id }, data: { status: accept ? 'Present' : 'Absent', flagReason } });
  await notify(a.studentId, `Your flagged check-in for ${se.section.module.code} was ${accept ? 'accepted' : 'marked absent'} by your tutor.`, 'Attendance');
  s.json({ attendanceId: a.id, status: accept ? 'present' : 'absent' });
});
app.post('/api/sessions/:id/flagged/:attendanceId/accept', auth('teacher'), decideFlag(true));
app.post('/api/sessions/:id/flagged/:attendanceId/reject', auth('teacher'), decideFlag(false));

// ---------- Evidence: view one request ----------
app.get('/api/evidence/:id', auth('student', 'teacher', 'admin', 'management'), wrap(async (q, s) => {
  const r = await prisma.evidenceDocument.findUnique({ where: { id: q.params.id }, include: { student: true, reviewer: true, module: { include: { sections: true } } } });
  if (!r) throw Error('Request not found');
  if ((q.user.role === 'student' && r.studentId !== q.user.id) || (q.user.role === 'teacher' && !r.module.sections.some((x) => x.tutorId === q.user.id)))
    return s.status(403).json({ error: 'Not allowed for your role' });
  s.json({ _id: r.id, type: (r.leaveType || '').toLowerCase(), date: r.date, reason: r.reason, fileUrl: r.documentUrl, fileName: r.originalFilename, status: r.status.toLowerCase(),
    createdAt: r.createdAt, reviewedAt: r.reviewedAt, reviewer: r.reviewer ? { userId: r.reviewer.id, name: r.reviewer.name } : null,
    student: { userId: r.student.id, name: r.student.name }, module: { name: r.module.name, code: r.module.code } });
}));

// ---------- Teacher: export attendance records (CSV / PDF) ----------
const recordRows = async (moduleId) => {
  const ses = await sessionsOf(moduleId), en = await prisma.enrollment.findMany({ where: { moduleId }, include: { student: true }, orderBy: { studentId: 'asc' } });
  const att = await prisma.attendance.findMany({ where: { sessionId: { in: ses.map((x) => x.id) }, status: { in: OK } } }), ids = (t) => ses.filter((x) => x.sessionType === t).map((x) => x.id);
  const p = (list, sid) => list.length ? Math.round(att.filter((a) => a.studentId === sid && list.includes(a.sessionId)).length / list.length * 100) : null;
  return { sessions: ses.length, rows: en.map(({ student: u }) => ({ userId: u.id, name: u.name, theory: p(ids('theory'), u.id), practical: p(ids('practical'), u.id), total: p(ses.map((x) => x.id), u.id) })) };
};
const exportModule = async (q) => {
  if (!(await mine(q.params.moduleId, q.user.id))) throw Error('This is not your module');
  const m = await prisma.module.findUnique({ where: { id: q.params.moduleId } });
  return { m, ...(await recordRows(m.id)) };
};
const riskLabel = (t) => (t == null ? 'No sessions' : t < AT_RISK_PCT ? 'At risk' : 'OK');
app.get('/api/teacher/records-export/:moduleId/csv', auth('teacher'), wrap(async (q, s) => {
  const { m, rows } = await exportModule(q);
  sendCsv(s, `${m.code}-attendance.csv`, ['Student ID', 'Name', 'Theory %', 'Practical %', 'Overall %', 'Status'],
    rows.map((r) => [r.userId, r.name, r.theory, r.practical, r.total, riskLabel(r.total)]));
}));
app.get('/api/teacher/records-export/:moduleId/pdf', auth('teacher'), wrap(async (q, s) => {
  const { m, rows, sessions } = await exportModule(q), doc = new PDFDocument({ size: 'A4', margin: 40 });
  s.set('Content-Type', 'application/pdf'); s.set('Content-Disposition', `attachment; filename="${m.code}-attendance.pdf"`); doc.pipe(s);
  doc.fontSize(16).text('CheckIn - Attendance Report').fontSize(10).fillColor('#555')
    .text(`College of Science and Technology - ${m.code} ${m.name}`).text(`${sessions} sessions - at risk below ${AT_RISK_PCT}% - generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`).moveDown();
  const cols = [['Student ID', 40], ['Name', 120], ['Theory %', 300], ['Practical %', 360], ['Overall %', 430], ['Status', 490]];
  const line = (vals, bold) => { if (doc.y > 780) doc.addPage(); const y = doc.y; doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#000');
    cols.forEach(([, x], i) => doc.text(vals[i] == null ? '-' : String(vals[i]), x, y, { width: i === 1 ? 175 : 60, lineBreak: false })); doc.moveDown(0.6); };
  line(cols.map((c) => c[0]), true);
  rows.forEach((r) => line([r.userId, r.name, r.theory, r.practical, r.total, riskLabel(r.total)]));
  doc.end();
}));

// ---------- Admin: tutor approvals ----------
app.get('/api/admin/tutors/pending', auth('admin', 'management'), wrap(async (q, s) =>
  s.json((await prisma.user.findMany({ where: { role: 'tutor', isActive: false, status: 'active' }, orderBy: { createdAt: 'asc' } })).map(userOut))));
app.post('/api/admin/tutors/:id/approve', auth('admin'), wrap(async (q, s) => {
  const u = await prisma.user.findFirst({ where: { id: q.params.id, role: 'tutor' } }); if (!u) throw Error('Tutor request not found');
  if (u.isActive) throw Error('This tutor is already active');
  await prisma.user.update({ where: { id: u.id }, data: { isActive: true, status: 'active' } });
  await notify(u.id, 'Your tutor account has been approved. You can now sign in.', 'System');
  await audit(q.user.id, 'Tutor Approved', `${u.name} (${u.id})`); s.json({ userId: u.id, status: 'active' });
}));
app.post('/api/admin/tutors/:id/reject', auth('admin'), wrap(async (q, s) => {
  const u = await prisma.user.findFirst({ where: { id: q.params.id, role: 'tutor' } }); if (!u) throw Error('Tutor request not found');
  if (u.isActive || u.status !== 'active') throw Error('Only pending tutor requests can be rejected');
  await prisma.user.update({ where: { id: u.id }, data: { status: 'inactive' } });
  await audit(q.user.id, 'Tutor Rejected', `${u.name} (${u.id})`); s.json({ userId: u.id, status: 'inactive' });
}));

// ---------- Admin: audit log viewer ----------
app.get('/api/admin/audit-logs', auth('admin', 'management'), wrap(async (q, s) => {
  const { action, from, to, q: text } = q.query, where = { ...(action && { action }) };
  if (from || to) where.timestamp = { ...(from && { gte: new Date(from) }), ...(to && { lt: new Date(new Date(to).getTime() + 864e5) }) };
  if (text) where.OR = [{ details: { contains: text, mode: 'insensitive' } }, { admin: { name: { contains: text, mode: 'insensitive' } } }];
  const l = await prisma.auditLog.findMany({ where, include: { admin: true }, orderBy: { timestamp: 'desc' }, take: Math.min(+q.query.limit || 100, 500) });
  s.json(l.map((x) => ({ _id: x.id, action: x.action, details: x.details, time: x.timestamp, admin: { userId: x.admin.id, name: x.admin.name } })));
}));
app.get('/api/admin/audit-actions', auth('admin', 'management'), wrap(async (q, s) =>
  s.json((await prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } })).map((x) => x.action))));

// ---------- Admin: at-risk students + CSV ----------
const atRisk = async (below, department) => {
  const en = await prisma.enrollment.findMany({ where: { student: { role: 'student', ...(department && { department }) } }, include: { student: true, module: true } }), cache = {}, out = [];
  for (const e of en) {
    const ses = cache[e.moduleId] || (cache[e.moduleId] = await sessionsOf(e.moduleId)); if (!ses.length) continue;
    const p = Math.round((await attended(e.studentId, ses.map((x) => x.id))).length / ses.length * 1000) / 10;
    if (p < below) out.push({ userId: e.student.id, name: e.student.name, department: e.student.department, module: { id: e.moduleId, code: e.module.code, name: e.module.name }, pct: p, sessions: ses.length });
  }
  return out.sort((a, b) => a.pct - b.pct);
};
app.get('/api/admin/reports/at-risk', auth('admin', 'management'), wrap(async (q, s) => {
  const below = +q.query.below || AT_RISK_PCT; s.json({ threshold: below, rows: await atRisk(below, q.query.department) });
}));
app.get('/api/admin/reports/at-risk/export.csv', auth('admin', 'management'), wrap(async (q, s) => {
  const rows = await atRisk(+q.query.below || AT_RISK_PCT, q.query.department);
  sendCsv(s, 'at-risk-students.csv', ['Student ID', 'Name', 'Department', 'Module code', 'Module', 'Attendance %', 'Sessions'],
    rows.map((r) => [r.userId, r.name, r.department, r.module.code, r.module.name, r.pct, r.sessions]));
}));

// ---------- Admin: programme report CSV ----------
app.get('/api/admin/programmes/:name/export.csv', auth('admin', 'management'), wrap(async (q, s) => {
  const studs = await prisma.user.findMany({ where: { role: 'student', department: q.params.name }, orderBy: { id: 'asc' } }), rows = [];
  for (const u of studs) { const p = await overall(u.id); rows.push([u.id, u.name, u.programme, p, p < AT_RISK_PCT ? 'At risk' : 'OK']); }
  sendCsv(s, `${q.params.name.replace(/[^\w.-]+/g, '_')}-report.csv`, ['Student ID', 'Name', 'Programme', 'Overall %', 'Status'], rows);
}));

// ---------- Admin: low-attendance alert job ----------
app.post('/api/admin/jobs/low-attendance', auth('admin'), wrap(async (q, s) => {
  const cutoff = new Date(Date.now() - REALERT_DAYS * 864e5), res = { scanned: 0, alerts: 0, skipped: 0 }, cache = {};
  const en = await prisma.enrollment.findMany({ where: { student: { role: 'student', isActive: true } }, include: { module: true } });
  for (const e of en) {
    const ses = cache[e.moduleId] || (cache[e.moduleId] = await sessionsOf(e.moduleId)); if (!ses.length) continue; res.scanned++;
    const p = Math.round((await attended(e.studentId, ses.map((x) => x.id))).length / ses.length * 100); if (p >= REQUIRED_PCT) continue;
    if (await prisma.notification.findFirst({ where: { userId: e.studentId, category: 'Attendance', createdAt: { gte: cutoff }, message: { contains: e.module.code } } })) { res.skipped++; continue; }
    await notify(e.studentId, `Your attendance in ${e.module.code} is ${p}% - below the ${REQUIRED_PCT}% requirement. Please speak to your tutor.`, 'Attendance'); res.alerts++;
  }
  await audit(q.user.id, 'Low-attendance job', `${res.alerts} alerts sent, ${res.skipped} skipped`); s.json(res);
}));

// ---------- Notifications: unread count, mark all read ----------
app.get('/api/notifications/unread-count', auth(), wrap(async (q, s) => s.json({ count: await prisma.notification.count({ where: { userId: q.user.id, isRead: false } }) })));
app.post('/api/notifications/read-all', auth(), wrap(async (q, s) =>
  s.json({ updated: (await prisma.notification.updateMany({ where: { userId: q.user.id, isRead: false }, data: { isRead: true } })).count })));

// ---------- Profile: avatar upload / remove ----------
const avatarUpload = multer({ storage: multer.diskStorage({ destination: 'uploads/', filename: (q, f, cb) => cb(null, `avatar-${q.user.id}-${Date.now()}${path.extname(f.originalname)}`) }),
  limits: { fileSize: 2 * 1024 * 1024 }, fileFilter: (q, f, cb) => cb(null, /^image\/(png|jpe?g|webp)$/.test(f.mimetype)) });
app.post('/api/me/avatar', auth(), avatarUpload.single('file'), wrap(async (q, s) => {
  if (!q.file) throw Error('Please choose a PNG, JPG or WebP image (max 2 MB)');
  s.json(userOut(await prisma.user.update({ where: { id: q.user.id }, data: { avatarUrl: '/uploads/' + q.file.filename } })));
}));
app.delete('/api/me/avatar', auth(), wrap(async (q, s) => s.json(userOut(await prisma.user.update({ where: { id: q.user.id }, data: { avatarUrl: null } })))));


// ---------- Departments & programmes (public: used by the sign-up form) ----------
const progOut = (p) => ({ id: p.id, name: p.name, level: p.level, years: p.durationYears, department: p.department ? { id: p.department.id, code: p.department.code, name: p.department.name } : null });
app.get('/api/departments', wrap(async (q, s) => s.json((await prisma.department.findMany({ include: { programs: { orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } }))
  .map((d) => ({ id: d.id, code: d.code, name: d.name, website: d.website, programs: d.programs.map(({ id, name, level, durationYears }) => ({ id, name, level, years: durationYears })) })))));
app.get('/api/programs', wrap(async (q, s) => s.json((await prisma.program.findMany({ where: { ...(q.query.level && { level: q.query.level }) }, include: { department: true }, orderBy: { name: 'asc' } })).map(progOut))));

// ---------- Unenrol a student (tutor of the module, or admin) ----------
app.delete('/api/modules/:id/students/:studentId', auth('teacher', 'admin'), wrap(async (q, s) => {
  if (q.user.role === 'teacher' && !(await mine(q.params.id, q.user.id))) throw Error('This is not your module');
  const m = await prisma.module.findUnique({ where: { id: q.params.id } }); if (!m) throw Error('Module not found');
  const r = await prisma.enrollment.deleteMany({ where: { moduleId: m.id, studentId: q.params.studentId } });
  if (!r.count) throw Error('That student is not enrolled in this module');
  await notify(q.params.studentId, `You were removed from ${m.code} - ${m.name}.`, 'System');
  if (q.user.role === 'admin') await audit(q.user.id, 'Student Unenrolled', `${q.params.studentId} from ${m.code}`);
  s.json({ message: 'Student removed from the module' });
}));

app.listen(process.env.PORT || 5000, () => console.log('CheckIn API ready (PostgreSQL + Prisma)'));
 