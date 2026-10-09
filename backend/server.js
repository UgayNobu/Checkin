require('dotenv').config();
const express = require('express'), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken'), cors = require('cors'), multer = require('multer'), path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient(), app = express();
app.use(cors(), express.json()); app.use('/uploads', express.static('uploads'));
const upload = multer({ storage: multer.diskStorage({ destination: 'uploads/', filename: (q, f, cb) => cb(null, Date.now() + path.extname(f.originalname)) }), limits: { fileSize: 10 * 1024 * 1024 } });
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
  role: roleOut(u.role), active: u.isActive, createdAt: u.createdAt, prefs: { low: true, relief: true, reminders: false, email: true, sms: false, push: true, ...(u.prefs || {}) } });
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
  const l = await prisma.module.findMany({ include: { program: true, sections: { take: 1 }, _count: { select: { enrollments: true } } }, orderBy: { code: 'asc' } });
  s.json(l.map((m) => ({ id: m.id, name: m.name, code: m.code, year: m.year, semester: m.semester, department: m.program.name, section: m.sections[0]?.name, students: m._count.enrollments })));
}));
app.post('/api/modules/enrol', auth('student'), wrap(async (q, s) => {
  const m = await prisma.module.findFirst({ where: { enrolmentKey: q.body.key || '__none__' } }); if (!m) throw Error('Enrolment key not found');
  if (await prisma.enrollment.findUnique({ where: { studentId_moduleId: { studentId: q.user.id, moduleId: m.id } } })) throw Error('Already enrolled');
  await prisma.enrollment.create({ data: { studentId: q.user.id, moduleId: m.id } }); s.json({ message: `Joined ${m.name}` });
}));
app.post('/api/attendance/checkin', auth('student'), wrap(async (q, s) => {
  const { code, lat, lng } = q.body;
  const c = await prisma.attendanceCode.findFirst({ where: { code: String(code || '').toUpperCase(), expiryTimestamp: { gt: new Date() } }, include: { session: { include: { section: { include: { module: true } } } } } });
  if (!c) throw Error('Code is invalid or has expired');
  const sec = c.session.section, m = sec.module, id = q.user.id;
  if (!(await prisma.enrollment.findUnique({ where: { studentId_moduleId: { studentId: id, moduleId: m.id } } }))) throw Error('You are not enrolled in this module');
  if (await prisma.attendance.findUnique({ where: { studentId_sessionId: { studentId: id, sessionId: c.sessionId } } })) throw Error('Already checked in');
  const distance = haversine(lat, lng, c.latitude, c.longitude), ok = distance <= c.geofenceRadius;
  await prisma.attendance.create({ data: { studentId: id, sessionId: c.sessionId, status: ok ? 'Present' : 'Flagged' } });
  if (!ok) { const u = await prisma.user.findUnique({ where: { id } }); await notify(sec.tutorId, `${u.name} checked in ${Math.round(distance)} m from the classroom (${m.code}). Please verify.`, 'Attendance'); }
  s.json({ status: ok ? 'present' : 'flagged', message: ok ? `Present in ${m.name}` : 'Checked in, but you seem to be outside the classroom. Your tutor will review it.' });
}));
app.get('/api/attendance/me', auth('student'), wrap(async (q, s) => {
  const en = await prisma.enrollment.findMany({ where: { studentId: q.user.id }, select: { moduleId: true } });
  s.json(await monthDays(q.user.id, en.map((e) => e.moduleId), q.query.month));
}));
app.post('/api/evidence', auth('student'), upload.single('file'), wrap(async (q, s) => {
  const { type, date, reason, module } = q.body; if (!module) throw Error('Please choose a module'); if (!date) throw Error('Please choose the date you missed');
  const r = await prisma.evidenceDocument.create({ data: { studentId: q.user.id, moduleId: module, date: new Date(date), reason, leaveType: type === 'official' ? 'Official' : 'Medical', documentUrl: q.file ? '/uploads/' + q.file.filename : null } });
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
    out.push({ id: x.moduleId, name: x.module.name, code: x.module.code, section: x.name, students: await prisma.enrollment.count({ where: { moduleId: x.moduleId } }), enrolmentKey: x.module.enrolmentKey }); }
  s.json(out);
}));
app.put('/api/modules/:id/key', auth('teacher'), wrap(async (q, s) => {
  if (!(await mine(q.params.id, q.user.id))) throw Error('This is not your module');
  s.json(await prisma.module.update({ where: { id: q.params.id }, data: { enrolmentKey: q.body.key } }));
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
  const se = await prisma.classSession.create({ data: { sectionId: sec.id, date: now, startTime: now, duration: Math.round((+hours || 1) * 60), sessionType: type,
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
  const r = await prisma.evidenceDocument.update({ where: { id: q.params.id }, data: { status: cap(q.body.status), reviewedBy: q.user.id } });
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
  const data = {}; if (q.body.active !== undefined) data.isActive = q.body.active; if (q.body.name) data.name = q.body.name;
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
  s.json({ module: { name: m.name, code: m.code }, totals: { students: rows.length, absence: rows.reduce((t, r) => t + r.absences, 0), relief: await prisma.evidenceDocument.count({ where: { moduleId: m.id, status: 'Approved' } }) }, rows });
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
 
app.listen(process.env.PORT || 5000, () => console.log('CheckIn API ready (PostgreSQL + Prisma)'));
 