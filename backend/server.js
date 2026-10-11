/* =====================================================================
   CheckIn API (Express + Prisma + PostgreSQL)
   College of Science and Technology
   ===================================================================== */
require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const PDFDocument = require('pdfkit');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();

/* =====================================================================
   1. Config (values come from .env, with defaults)
   ===================================================================== */
const REQUIRED_PCT = +process.env.REQUIRED_ATTENDANCE_PERCENT || 90;
const AT_RISK_PCT = +process.env.AT_RISK_ATTENDANCE_PERCENT || 80;
const ACCURACY_MAX = +process.env.ACCURACY_FLAG_METRES || 50;
const RADIUS = +process.env.GEOFENCE_METRES || 10;
const REALERT_DAYS = +process.env.LOW_ATTENDANCE_REALERT_DAYS || 7;
const CHECKIN_MINUTES = +process.env.CHECKIN_WINDOW_MINUTES || 5; // how long a code stays valid
const NETWORK_GRACE_SECONDS = +process.env.NETWORK_GRACE_SECONDS || 120; // extra time for check-ins held back by bad internet

const OK = ['Present', 'Late']; // statuses that count as attended
const FLAGGED = ['Flagged', 'Pending review']; // statuses waiting for tutor review

/* =====================================================================
   2. Middleware
   ===================================================================== */
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => cb(null, `avatar-${req.user.id}-${Date.now()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g|webp)$/.test(file.mimetype)),
});

/* =====================================================================
   3. Helpers
   ===================================================================== */

/* ---------- Request handling ---------- */

// Turns thrown errors into a 400 JSON response
const wrap = (fn) => (req, res, next) =>
  fn(req, res, next).catch((e) =>
    res.status(400).json({ error: e.code === 'P2002' ? 'That ID, email or record already exists' : e.message })
  );

// Checks the JWT and (optionally) the user's role
const auth = (...roles) => (req, res, next) => {
  try {
    req.user = jwt.verify((req.headers.authorization || '').slice(7), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Please log in' });
  }
  if (roles.length && !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Not allowed for your role' });
  }
  next();
};

/* ---------- Small formatters ---------- */
const roleOut = (r) => (r === 'tutor' ? 'teacher' : r); // database -> API
const roleIn = (r) => (r === 'teacher' ? 'tutor' : r); // API -> database
const cap = (x) => x[0].toUpperCase() + x.slice(1);
const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

// Database status -> 'present' | 'flagged' | 'absent'
const apiStatus = (x) => (OK.includes(x) ? 'present' : FLAGGED.includes(x) ? 'flagged' : 'absent');

// Readable text for a flag reason (a tutor note may be appended as " - note")
const FLAG_TEXT = {
  permission_denied: 'Location not shared',
  location_error: 'Browser could not get location',
  outside_radius: 'Outside classroom area',
  low_accuracy: 'Weak GPS accuracy',
  network_issue: 'Sent late (poor internet)',
};
const flagText = (reason) => (reason ? FLAG_TEXT[String(reason).split(' - ')[0]] || reason : null);

// Distance in metres between two lat/lng points
const haversine = (lat1, lng1, lat2, lng2) => {
  const rad = (x) => (x * Math.PI) / 180;
  const h =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
};

// Session date + start_time combined into one instant
const at = (x) =>
  new Date(x.date.toISOString().slice(0, 10) + 'T' + x.startTime.toISOString().slice(11, 19) + 'Z');

const userOut = (u) => ({
  _id: u.id,
  userId: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  department: u.department,
  designation: u.designation,
  programme: u.programme,
  role: roleOut(u.role),
  active: u.isActive,
  createdAt: u.createdAt,
  avatarUrl: u.avatarUrl || null,
  prefs: { low: true, evidence: true, reminders: false, email: true, sms: false, push: true, ...(u.prefs || {}) },
});

const csvCell = (v) => {
  const x = v == null ? '' : String(v);
  return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
};
const sendCsv = (res, name, header, rows) => {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${name}"`);
  res.send([header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n'));
};

/* ---------- Logging & notifications ---------- */
const audit = (adminId, action, details) =>
  prisma.auditLog.create({ data: { adminId, action, details } }).catch(() => {});
const notify = (userId, message, category) =>
  prisma.notification.create({ data: { userId, message, category } }).catch(() => {});

/* ---------- Attendance maths ---------- */
const sessionsOf = (moduleId) =>
  prisma.classSession.findMany({
    where: { section: { moduleId } },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });

const attended = (studentId, sessionIds) =>
  prisma.attendance.findMany({
    where: { studentId, sessionId: { in: sessionIds }, status: { in: OK } },
    select: { sessionId: true },
  });

// One student's % in one module
const pct = async (studentId, moduleId) => {
  const ses = await sessionsOf(moduleId);
  if (!ses.length) return 0;
  const got = await attended(studentId, ses.map((x) => x.id));
  return Math.round((got.length / ses.length) * 1000) / 10;
};

// One student's % across all enrolled modules
const overall = async (studentId) => {
  let total = 0;
  let present = 0;
  for (const e of await prisma.enrollment.findMany({ where: { studentId }, select: { moduleId: true } })) {
    const ses = await sessionsOf(e.moduleId);
    total += ses.length;
    present += (await attended(studentId, ses.map((x) => x.id))).length;
  }
  return total ? Math.round((present / total) * 100) : 0;
};

// Calendar: day -> best status that day
const monthDays = async (studentId, moduleIds, month) => {
  const [y, mo] = month.split('-').map(Number);
  const out = {};
  const ses = await prisma.classSession.findMany({
    where: {
      section: { moduleId: { in: moduleIds } },
      date: { gte: new Date(Date.UTC(y, mo - 1, 1)), lt: new Date(Date.UTC(y, mo, 1)) },
    },
  });
  const att = await prisma.attendance.findMany({ where: { studentId, sessionId: { in: ses.map((x) => x.id) } } });

  for (const x of ses) {
    const r = att.find((t) => t.sessionId === x.id);
    const st = r ? apiStatus(r.status) : 'absent';
    const d = x.date.getUTCDate();
    if (!out[d] || st === 'present' || (st === 'flagged' && out[d] === 'absent')) out[d] = st;
  }
  return out;
};

/* ---------- Ownership checks ---------- */

// The section of a module taught by this tutor (null if not theirs)
const mine = (moduleId, tutorId) => prisma.section.findFirst({ where: { moduleId, tutorId } });

// A session that belongs to this tutor, or throws
const ownedSession = async (id, tutorId) => {
  const se = await prisma.classSession.findUnique({
    where: { id },
    include: { section: { include: { module: true } }, codes: true },
  });
  if (!se || se.section.tutorId !== tutorId) throw Error('Session not found');
  return se;
};

/* ---------- Check-in codes & session closing ---------- */

// No 0/O or 1/I so students can't mistype them
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = (len = 6) =>
  Array.from({ length: len }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');

// A code that has never been used before
const uniqueCode = async () => {
  for (let i = 0; i < 10; i++) {
    const code = randomCode();
    if (!(await prisma.attendanceCode.findFirst({ where: { code } }))) return code;
  }
  throw Error('Could not generate a unique code. Please try again.');
};

// Ends a session and marks every enrolled student who never checked in as Absent
const finalizeSession = async (sessionId) => {
  const se = await prisma.classSession.findUnique({ where: { id: sessionId }, include: { section: true } });
  if (!se || se.status === 'ended') return;

  const enrolled = await prisma.enrollment.findMany({
    where: { moduleId: se.section.moduleId },
    select: { studentId: true },
  });
  const checkedIn = new Set(
    (await prisma.attendance.findMany({ where: { sessionId }, select: { studentId: true } })).map((a) => a.studentId)
  );
  const missing = enrolled.filter((e) => !checkedIn.has(e.studentId));

  await prisma.$transaction([
    prisma.attendance.createMany({
      data: missing.map((e) => ({ studentId: e.studentId, sessionId, status: 'Absent' })),
      skipDuplicates: true,
    }),
    prisma.classSession.update({ where: { id: sessionId }, data: { status: 'ended' } }),
  ]);
};

// Closes every ongoing session whose code (plus grace time) has run out.
// Runs on a timer, so absences are recorded even if the tutor closes the page.
const sweepExpiredSessions = async () => {
  const cutoff = new Date(Date.now() - NETWORK_GRACE_SECONDS * 1000);
  const expired = await prisma.classSession.findMany({
    where: { status: 'ongoing', codes: { some: {}, every: { expiryTimestamp: { lte: cutoff } } } },
    select: { id: true },
  });
  for (const x of expired) await finalizeSession(x.id);
};

/* =====================================================================
   4. Health
   ===================================================================== */
app.get('/health', (req, res) =>
  res.json({ status: 'ok', service: 'checkin-backend', time: new Date().toISOString() })
);

/* =====================================================================
   5. Auth & profile
   ===================================================================== */
app.post('/api/auth/register', wrap(async (req, res) => {
  const { userId, name, email, password, role = 'student', programme, department } = req.body;
  if (!['student', 'teacher'].includes(role)) throw Error('Invalid role');
  if (!userId || !email || !password) throw Error('ID, email and password are required');

  await prisma.user.create({
    data: {
      id: userId,
      name,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: roleIn(role),
      programme,
      isActive: role === 'student', // tutors wait for admin approval
      department: department || (programme || '').replace(/^BE /, '') || null,
      year: role === 'student' ? 1 : null,
    },
  });

  res.json({
    message: role === 'teacher' ? 'Request submitted. An admin will approve your account.' : 'Account created',
  });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: String(req.body.userId || '') } });
  if (!u || !u.passwordHash || !(await bcrypt.compare(req.body.password || '', u.passwordHash))) {
    throw Error('Wrong ID or password');
  }
  if (!u.isActive) throw Error('Account is not active');

  res.json({
    token: jwt.sign({ id: u.id, role: roleOut(u.role) }, process.env.JWT_SECRET, { expiresIn: '8h' }),
    user: { name: u.name, userId: u.id, role: roleOut(u.role) },
  });
}));

app.get('/api/me', auth(), wrap(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.user.id } });
  res.json(userOut(u));
}));

app.put('/api/me', auth(), wrap(async (req, res) => {
  const { name, email, phone, prefs } = req.body;
  const u = await prisma.user.findUnique({ where: { id: req.user.id } });
  const data = Object.fromEntries(Object.entries({ name, email, phone }).filter(([, v]) => v !== undefined));
  if (prefs) data.prefs = { ...(u.prefs || {}), ...prefs };
  res.json(userOut(await prisma.user.update({ where: { id: req.user.id }, data })));
}));

app.put('/api/me/password', auth(), wrap(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.user.id } });
  const { current, next } = req.body;
  if (!(await bcrypt.compare(current || '', u.passwordHash))) throw Error('Current password is wrong');
  if (!/.{8,}/.test(next) || !/\d/.test(next) || !/[^\w\s]/.test(next)) {
    throw Error('Password needs 8+ characters, a number and a symbol');
  }
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  res.json({ message: 'Password updated' });
}));

app.post('/api/me/avatar', auth(), avatarUpload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw Error('Please choose a PNG, JPG or WebP image (max 2 MB)');
  const u = await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl: '/uploads/' + req.file.filename } });
  res.json(userOut(u));
}));

app.delete('/api/me/avatar', auth(), wrap(async (req, res) => {
  const u = await prisma.user.update({ where: { id: req.user.id }, data: { avatarUrl: null } });
  res.json(userOut(u));
}));

/* =====================================================================
   6. Notifications
   ===================================================================== */
app.get('/api/notifications', auth(), wrap(async (req, res) => {
  res.json(await prisma.notification.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  }));
}));

app.put('/api/notifications/:id/read', auth(), wrap(async (req, res) => {
  await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: { isRead: true } });
  res.json({ ok: true });
}));

app.get('/api/notifications/unread-count', auth(), wrap(async (req, res) => {
  res.json({ count: await prisma.notification.count({ where: { userId: req.user.id, isRead: false } }) });
}));

app.post('/api/notifications/read-all', auth(), wrap(async (req, res) => {
  const r = await prisma.notification.updateMany({ where: { userId: req.user.id, isRead: false }, data: { isRead: true } });
  res.json({ updated: r.count });
}));

/* =====================================================================
   7. Departments & programmes (public: used by the sign-up form)
   ===================================================================== */
const progOut = (p) => ({
  id: p.id,
  name: p.name,
  level: p.level,
  years: p.durationYears,
  department: p.department ? { id: p.department.id, code: p.department.code, name: p.department.name } : null,
});

app.get('/api/departments', wrap(async (req, res) => {
  const l = await prisma.department.findMany({
    include: { programs: { orderBy: { name: 'asc' } } },
    orderBy: { name: 'asc' },
  });
  res.json(l.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    website: d.website,
    programs: d.programs.map(({ id, name, level, durationYears }) => ({ id, name, level, years: durationYears })),
  })));
}));

app.get('/api/programs', wrap(async (req, res) => {
  const l = await prisma.program.findMany({
    where: { ...(req.query.level && { level: req.query.level }) },
    include: { department: true },
    orderBy: { name: 'asc' },
  });
  res.json(l.map(progOut));
}));

/* =====================================================================
   8. Student
   ===================================================================== */
app.get('/api/student/dashboard', auth('student'), wrap(async (req, res) => {
  const en = await prisma.enrollment.findMany({ where: { studentId: req.user.id }, include: { module: true } });
  res.json(await Promise.all(en.map(async (e) => ({
    id: e.moduleId,
    name: e.module.name,
    code: e.module.code,
    pct: await pct(req.user.id, e.moduleId),
  }))));
}));

app.get('/api/student/summary', auth('student'), wrap(async (req, res) => {
  let total = 0;
  let present = 0;
  for (const e of await prisma.enrollment.findMany({ where: { studentId: req.user.id } })) {
    const ses = await sessionsOf(e.moduleId);
    total += ses.length;
    present += (await attended(req.user.id, ses.map((x) => x.id))).length;
  }
  res.json({ rate: total ? Math.round((present / total) * 100) : 0, absences: total - present });
}));

app.get('/api/student/modules/:id/records', auth('student'), wrap(async (req, res) => {
  const ses = await sessionsOf(req.params.id);
  const got = new Set((await attended(req.user.id, ses.map((x) => x.id))).map((a) => a.sessionId));
  const rows = ses
    .map((x) => ({ date: at(x), hours: x.duration / 60, type: x.sessionType, status: got.has(x.id) ? 'present' : 'absent' }))
    .reverse();

  const part = (type) => {
    const l = rows.filter((r) => r.type === type);
    return { rows: l, pct: l.length ? Math.round((l.filter((r) => r.status === 'present').length / l.length) * 100) : 0 };
  };
  res.json({ theory: part('theory'), practical: part('practical') });
}));

app.get('/api/modules/browse', auth('student'), wrap(async (req, res) => {
  const mineIds = new Set((await prisma.enrollment.findMany({ where: { studentId: req.user.id }, select: { moduleId: true } })).map((e) => e.moduleId));
  // one row per programme/year/semester the module belongs to (program_modules)
  const l = await prisma.programModule.findMany({
    include: { program: true, module: { include: { sections: { take: 1 }, _count: { select: { enrollments: true } } } } },
    orderBy: { module: { code: 'asc' } },
  });
  res.json(l.map(({ module: m, program, year, semester }) => ({
    id: m.id,
    name: m.name,
    code: m.code,
    year,
    semester,
    department: program.name,
    section: m.sections[0]?.name,
    students: m._count.enrollments,
    selfEnrol: m.selfEnrol,
    enrolled: mineIds.has(m.id),
  })));
}));

// VLE-style enrolment: body { module, key } (or just { key })
app.post('/api/modules/enrol', auth('student'), wrap(async (req, res) => {
  const key = String(req.body.key || '').trim();
  if (!key) throw Error('Please enter the enrolment key');
  const m = req.body.module
    ? await prisma.module.findUnique({ where: { id: String(req.body.module) } })
    : await prisma.module.findFirst({ where: { enrolmentKey: { equals: key, mode: 'insensitive' } } });
  if (!m) throw Error(req.body.module ? 'Module not found' : 'Enrolment key not found');
  if (!m.selfEnrol) throw Error('Self-enrolment is closed for this module. Ask your tutor to add you.');
  if (!m.enrolmentKey || m.enrolmentKey.toLowerCase() !== key.toLowerCase()) throw Error('Wrong enrolment key for this module');
  const exists = await prisma.enrollment.findUnique({
    where: { studentId_moduleId: { studentId: req.user.id, moduleId: m.id } },
  });
  if (exists) throw Error('Already enrolled');
  await prisma.enrollment.create({ data: { studentId: req.user.id, moduleId: m.id } });
  res.json({ message: `Joined ${m.name}` });
}));

/* ---------- Check-in ----------
   Body: { code, lat, lng, accuracy, permissionDenied, locationError, offline }
   - present : inside the geofence with good GPS accuracy
   - flagged : location shared but unreliable, or a technical problem
               (tutor reviews it and accepts or rejects)
   - offline : true when the app held the check-in back because of bad internet;
               it is then accepted up to NETWORK_GRACE_SECONDS after expiry, as flagged
*/
app.post('/api/attendance/checkin', auth('student'), wrap(async (req, res) => {
  const { code, lat, lng, accuracy, permissionDenied, locationError, offline } = req.body;
  const now = new Date();
  const graceStart = new Date(now.getTime() - NETWORK_GRACE_SECONDS * 1000);

  const c = await prisma.attendanceCode.findFirst({
    where: {
      code: String(code || '').trim().toUpperCase(),
      expiryTimestamp: { gt: offline ? graceStart : now },
    },
    include: { session: { include: { section: { include: { module: true } } } } },
  });
  if (!c) throw Error('Code is invalid or has expired');
  if (c.session.status === 'ended') throw Error('This session has ended');

  const sec = c.session.section;
  const m = sec.module;
  const id = req.user.id;
  const late = c.expiryTimestamp <= now; // only possible when offline = true

  const enrolled = await prisma.enrollment.findUnique({ where: { studentId_moduleId: { studentId: id, moduleId: m.id } } });
  if (!enrolled) throw Error('You are not enrolled in this module');
  const already = await prisma.attendance.findUnique({ where: { studentId_sessionId: { studentId: id, sessionId: c.sessionId } } });
  if (already) throw Error('Already checked in');

  // Decide present vs flagged
  const noCoords = lat == null || lng == null || lat === '' || lng === '';
  const acc = accuracy == null || accuracy === '' ? null : +accuracy;
  let flagReason = null;
  let distance = null;

  if (permissionDenied) {
    flagReason = 'permission_denied';
  } else if (locationError) {
    flagReason = 'location_error';
  } else if (noCoords) {
    flagReason = 'permission_denied';
  } else {
    distance = Math.round(haversine(+lat, +lng, c.latitude, c.longitude) * 10) / 10;
    if (distance > c.geofenceRadius) {
      // If the GPS error margin could put them inside the room, it's a GPS problem, not "outside"
      flagReason = acc != null && distance - acc <= c.geofenceRadius ? 'low_accuracy' : 'outside_radius';
    } else if (acc != null && acc > ACCURACY_MAX) {
      flagReason = 'low_accuracy';
    }
  }
  if (!flagReason && late) flagReason = 'network_issue';

  const ok = !flagReason;

  await prisma.attendance.create({
    data: {
      studentId: id,
      sessionId: c.sessionId,
      status: ok ? 'Present' : 'Flagged',
      flagReason,
      distanceMeters: distance,
      submittedLat: distance == null ? null : +lat,
      submittedLng: distance == null ? null : +lng,
      accuracy: acc,
    },
  });

  // Tell the tutor about anything flagged
  if (!ok) {
    const u = await prisma.user.findUnique({ where: { id } });
    const why = {
      outside_radius: `${Math.round(distance)} m from the classroom`,
      low_accuracy: `with weak GPS accuracy (${acc == null ? '?' : Math.round(acc)} m)`,
      permission_denied: 'without sharing location',
      location_error: 'but their browser could not get a location',
      network_issue: 'after the code expired (poor internet connection)',
    }[flagReason];
    await notify(sec.tutorId, `${u.name} checked in ${why} (${m.code}). Please verify.`, 'Attendance');
  }

  res.json({
    status: ok ? 'present' : 'flagged',
    flagReason,
    reason: flagText(flagReason),
    distance,
    message: ok
      ? `Present in ${m.name}`
      : 'Checked in, but your attendance needs a quick check. Your tutor will review it.',
  });
}));

app.get('/api/attendance/me', auth('student'), wrap(async (req, res) => {
  const en = await prisma.enrollment.findMany({ where: { studentId: req.user.id }, select: { moduleId: true } });
  res.json(await monthDays(req.user.id, en.map((e) => e.moduleId), req.query.month));
}));

app.post('/api/evidence', auth('student'), upload.single('file'), wrap(async (req, res) => {
  const { type, date, reason, module } = req.body;
  if (!module) throw Error('Please choose a module');
  if (!date) throw Error('Please choose the date you missed');

  const r = await prisma.evidenceDocument.create({
    data: {
      studentId: req.user.id,
      moduleId: module,
      date: new Date(date),
      reason,
      leaveType: type === 'official' ? 'Official' : 'Medical',
      documentUrl: req.file ? '/uploads/' + req.file.filename : null,
      originalFilename: req.file ? req.file.originalname : null,
    },
  });
  res.json({ _id: r.id });
}));

app.get('/api/evidence/mine', auth('student'), wrap(async (req, res) => {
  const l = await prisma.evidenceDocument.findMany({
    where: { studentId: req.user.id },
    include: { module: true, student: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(l.map((r) => ({
    _id: r.id,
    type: (r.leaveType || '').toLowerCase(),
    date: r.date,
    reason: r.reason,
    fileUrl: r.documentUrl,
    status: r.status.toLowerCase(),
    student: { name: r.student.name, userId: r.student.id },
    module: { name: r.module.name, code: r.module.code },
  })));
}));

/* =====================================================================
   9. Teacher (role "tutor" in the database)
   ===================================================================== */

/* ---------- Modules ---------- */

// Only modules an admin assigned to this tutor (through a section)
app.get('/api/teacher/modules', auth('teacher'), wrap(async (req, res) => {
  const secs = await prisma.section.findMany({ where: { tutorId: req.user.id }, include: { module: true } });
  const seen = new Set();
  const out = [];
  for (const x of secs) {
    if (seen.has(x.moduleId)) continue;
    seen.add(x.moduleId);
    out.push({
      id: x.moduleId,
      name: x.module.name,
      code: x.module.code,
      section: x.name,
      students: await prisma.enrollment.count({ where: { moduleId: x.moduleId } }),
      enrolmentKey: x.module.enrolmentKey,
      selfEnrol: x.module.selfEnrol,
    });
  }
  res.json(out);
}));

app.put('/api/modules/:id/key', auth('teacher'), wrap(async (req, res) => {
  if (!(await mine(req.params.id, req.user.id))) throw Error('This is not your module');
  const data = {};
  if (req.body.key !== undefined) {
    const key = String(req.body.key || '').trim() || null;
    if (key && await prisma.module.findFirst({ where: { enrolmentKey: { equals: key, mode: 'insensitive' }, NOT: { id: req.params.id } } }))
      throw Error('This key is already used by another module. Please choose a different one.');
    data.enrolmentKey = key;
  }
  if (typeof req.body.selfEnrol === 'boolean') data.selfEnrol = req.body.selfEnrol;
  const m = await prisma.module.update({ where: { id: req.params.id }, data });
  res.json({ id: m.id, enrolmentKey: m.enrolmentKey, selfEnrol: m.selfEnrol });
}));

app.get('/api/modules/:id/students', auth('teacher', 'admin', 'management'), wrap(async (req, res) => {
  const l = await prisma.enrollment.findMany({
    where: { moduleId: req.params.id },
    include: { student: true },
    orderBy: { enrolledDate: 'asc' },
  });
  res.json(l.map((e) => ({ student: { userId: e.student.id, name: e.student.name }, date: e.enrolledDate })));
}));

app.post('/api/modules/:id/students', auth('teacher'), wrap(async (req, res) => {
  if (!(await mine(req.params.id, req.user.id))) throw Error('This is not your module');
  const u = await prisma.user.findFirst({ where: { id: req.body.userId, role: 'student' } });
  if (!u) throw Error('Student not found');
  await prisma.enrollment.upsert({
    where: { studentId_moduleId: { studentId: u.id, moduleId: req.params.id } },
    update: {},
    create: { studentId: u.id, moduleId: req.params.id },
  });
  res.json({ message: 'Student added' });
}));

/* ---------- Sessions ---------- */

// Start a session: new unique code, valid for CHECKIN_MINUTES
app.post('/api/sessions', auth('teacher'), wrap(async (req, res) => {
  const { module, room, type, hours, lat, lng } = req.body;
  const sec = await mine(module, req.user.id);
  if (!sec) throw Error('This is not your module');
  if (lat == null || lng == null || lat === '' || lng === '') throw Error('Your location is needed to start a session');

  if (room && room !== sec.room) {
    await prisma.section.update({ where: { id: sec.id }, data: { room } });
  }

  const now = new Date();
  const code = await uniqueCode();
  const expiresAt = new Date(now.getTime() + CHECKIN_MINUTES * 60000);

  const se = await prisma.classSession.create({
    data: {
      sectionId: sec.id,
      date: now,
      startTime: now,
      duration: Math.round((+hours || 1) * 60),
      sessionType: type,
      status: 'ongoing',
      codes: {
        create: { code, expiryTimestamp: expiresAt, geofenceRadius: RADIUS, latitude: +lat, longitude: +lng },
      },
    },
  });

  res.json({ _id: se.id, code, expiresAt });
}));

// Live counts while the code is open (also closes the session once time is up)
app.get('/api/sessions/:id/live', auth('teacher'), wrap(async (req, res) => {
  const se = await ownedSession(req.params.id, req.user.id);
  const c = se.codes[0];
  let status = se.status;

  const graceOver = c && c.expiryTimestamp.getTime() + NETWORK_GRACE_SECONDS * 1000 <= Date.now();
  if (status === 'ongoing' && graceOver) {
    await finalizeSession(se.id);
    status = 'ended';
  }

  const total = await prisma.enrollment.count({ where: { moduleId: se.section.moduleId } });
  const list = await prisma.attendance.findMany({ where: { sessionId: se.id }, include: { student: true } });
  const present = list.filter((a) => OK.includes(a.status)).length;
  const flagged = list.filter((a) => apiStatus(a.status) === 'flagged');

  res.json({
    code: c ? c.code : null,
    expiresAt: c ? c.expiryTimestamp : null,
    status,
    total,
    checkedIn: present,
    absent: Math.max(0, total - present - flagged.length),
    flagged: flagged.map((a) => ({ id: a.id, name: a.student.name, reason: flagText(a.flagReason) })),
  });
}));

app.get('/api/sessions/mine', auth('teacher'), wrap(async (req, res) => {
  const l = await prisma.classSession.findMany({
    where: { section: { tutorId: req.user.id } },
    include: { section: { include: { module: true } }, _count: { select: { attendance: true } } },
    orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
    take: Math.min(+req.query.limit || 50, 200),
  });
  res.json(l.map((x) => ({
    _id: x.id,
    module: { id: x.section.moduleId, code: x.section.module.code, name: x.section.module.name },
    section: x.section.name,
    room: x.section.room,
    date: at(x),
    hours: x.duration / 60,
    type: x.sessionType,
    status: x.status,
    checkIns: x._count.attendance,
  })));
}));

// End a session early: closes the code now and marks the rest absent
app.post('/api/sessions/:id/end', auth('teacher'), wrap(async (req, res) => {
  const se = await ownedSession(req.params.id, req.user.id);
  const now = new Date();
  await prisma.attendanceCode.updateMany({
    where: { sessionId: se.id, expiryTimestamp: { gt: now } },
    data: { expiryTimestamp: now },
  });
  await finalizeSession(se.id);
  res.json({ _id: se.id, status: 'ended' });
}));

app.get('/api/sessions/:id/roster', auth('teacher'), wrap(async (req, res) => {
  const se = await ownedSession(req.params.id, req.user.id);
  const c = se.codes[0];
  const en = await prisma.enrollment.findMany({
    where: { moduleId: se.section.moduleId },
    include: { student: true },
    orderBy: { studentId: 'asc' },
  });
  const att = await prisma.attendance.findMany({ where: { sessionId: se.id } });

  const rows = en.map(({ student: u }) => {
    const a = att.find((t) => t.studentId === u.id);
    return {
      attendanceId: a ? a.id : null,
      userId: u.id,
      name: u.name,
      status: a ? apiStatus(a.status) : 'absent',
      time: a ? a.timestamp : null,
      flagReason: a ? a.flagReason : null,
      reason: a ? flagText(a.flagReason) : null,
      distance: a ? a.distanceMeters : null,
      accuracy: a ? a.accuracy : null,
    };
  });
  const count = (st) => rows.filter((r) => r.status === st).length;

  res.json({
    session: {
      _id: se.id,
      module: { code: se.section.module.code, name: se.section.module.name },
      date: at(se),
      type: se.sessionType,
      status: se.status,
      code: c ? c.code : null,
      expiresAt: c ? c.expiryTimestamp : null,
    },
    counts: { enrolled: rows.length, present: count('present'), flagged: count('flagged'), absent: count('absent') },
    rows,
  });
}));

// Tutor accepts (present) or rejects (absent) a flagged check-in
const decideFlag = (accept) => wrap(async (req, res) => {
  const se = await ownedSession(req.params.id, req.user.id);
  const a = await prisma.attendance.findUnique({ where: { id: req.params.attendanceId } });
  if (!a || a.sessionId !== se.id) throw Error('Check-in not found');
  if (apiStatus(a.status) !== 'flagged') throw Error('This check-in is not flagged');

  const note = String((req.body && req.body.note) || '').trim();
  const flagReason = note ? `${a.flagReason || 'reviewed'} - ${note}`.slice(0, 100) : a.flagReason;

  await prisma.attendance.update({ where: { id: a.id }, data: { status: accept ? 'Present' : 'Absent', flagReason } });
  await notify(
    a.studentId,
    `Your flagged check-in for ${se.section.module.code} was ${accept ? 'accepted' : 'marked absent'} by your tutor.`,
    'Attendance'
  );
  res.json({ attendanceId: a.id, status: accept ? 'present' : 'absent' });
});
app.post('/api/sessions/:id/flagged/:attendanceId/accept', auth('teacher'), decideFlag(true));
app.post('/api/sessions/:id/flagged/:attendanceId/reject', auth('teacher'), decideFlag(false));

/* ---------- Attendance records ---------- */

// All students in one module, with practical / theory / total % and flagged count
app.get('/api/teacher/records/:moduleId', auth('teacher'), wrap(async (req, res) => {
  if (!(await mine(req.params.moduleId, req.user.id))) throw Error('This is not your module');

  const ses = await sessionsOf(req.params.moduleId);
  const sesIds = ses.map((x) => x.id);
  const en = await prisma.enrollment.findMany({ where: { moduleId: req.params.moduleId }, include: { student: true } });
  const att = await prisma.attendance.findMany({ where: { sessionId: { in: sesIds }, status: { in: OK } } });
  const flags = await prisma.attendance.findMany({
    where: { sessionId: { in: sesIds }, status: { in: FLAGGED } },
    select: { studentId: true },
  });

  const idsOf = (type) => ses.filter((x) => x.sessionType === type).map((x) => x.id);
  const percent = (list, studentId) =>
    list.length
      ? Math.round((att.filter((a) => a.studentId === studentId && list.includes(a.sessionId)).length / list.length) * 100)
      : 0;

  res.json(en.map(({ student: u }) => ({
    id: u.id,
    userId: u.id,
    name: u.name,
    practical: percent(idsOf('practical'), u.id),
    theory: percent(idsOf('theory'), u.id),
    total: percent(sesIds, u.id),
    flagged: flags.filter((f) => f.studentId === u.id).length,
  })));
}));

// One student, date by date: present / flagged / absent with flag reasons
app.get('/api/teacher/records/:moduleId/:studentId', auth('teacher'), wrap(async (req, res) => {
  if (!(await mine(req.params.moduleId, req.user.id))) throw Error('This is not your module');

  const stu = await prisma.user.findUnique({ where: { id: req.params.studentId } });
  if (!stu) throw Error('Student not found');

  const ses = await sessionsOf(req.params.moduleId);
  const att = await prisma.attendance.findMany({ where: { studentId: stu.id, sessionId: { in: ses.map((x) => x.id) } } });
  const RANK = { absent: 0, flagged: 1, present: 2 }; // best result wins if there are 2 sessions of a type in a day
  const rows = {};

  for (const x of ses) {
    const day = x.date.toISOString().slice(0, 10);
    const a = att.find((t) => t.sessionId === x.id);
    const status = a ? apiStatus(a.status) : 'absent';
    rows[day] = rows[day] || { date: day };

    const prev = rows[day][x.sessionType];
    if (!prev || RANK[status] > RANK[prev]) {
      rows[day][x.sessionType] = status;
      rows[day][x.sessionType + 'Reason'] = status === 'flagged' ? flagText(a.flagReason) : null;
    }
  }

  res.json({ student: { userId: stu.id, name: stu.name }, rows: Object.values(rows) });
}));

/* ---------- Records export (CSV / PDF) ---------- */
const recordRows = async (moduleId) => {
  const ses = await sessionsOf(moduleId);
  const en = await prisma.enrollment.findMany({ where: { moduleId }, include: { student: true }, orderBy: { studentId: 'asc' } });
  const att = await prisma.attendance.findMany({ where: { sessionId: { in: ses.map((x) => x.id) }, status: { in: OK } } });
  const idsOf = (type) => ses.filter((x) => x.sessionType === type).map((x) => x.id);
  const percent = (list, studentId) =>
    list.length
      ? Math.round((att.filter((a) => a.studentId === studentId && list.includes(a.sessionId)).length / list.length) * 100)
      : null;

  return {
    sessions: ses.length,
    rows: en.map(({ student: u }) => ({
      userId: u.id,
      name: u.name,
      theory: percent(idsOf('theory'), u.id),
      practical: percent(idsOf('practical'), u.id),
      total: percent(ses.map((x) => x.id), u.id),
    })),
  };
};

const exportModule = async (req) => {
  if (!(await mine(req.params.moduleId, req.user.id))) throw Error('This is not your module');
  const m = await prisma.module.findUnique({ where: { id: req.params.moduleId } });
  return { m, ...(await recordRows(m.id)) };
};

const riskLabel = (t) => (t == null ? 'No sessions' : t < AT_RISK_PCT ? 'At risk' : 'OK');

app.get('/api/teacher/records-export/:moduleId/csv', auth('teacher'), wrap(async (req, res) => {
  const { m, rows } = await exportModule(req);
  sendCsv(
    res,
    `${m.code}-attendance.csv`,
    ['Student ID', 'Name', 'Theory %', 'Practical %', 'Overall %', 'Status'],
    rows.map((r) => [r.userId, r.name, r.theory, r.practical, r.total, riskLabel(r.total)])
  );
}));

app.get('/api/teacher/records-export/:moduleId/pdf', auth('teacher'), wrap(async (req, res) => {
  const { m, rows, sessions } = await exportModule(req);
  const doc = new PDFDocument({ size: 'A4', margin: 40 });

  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="${m.code}-attendance.pdf"`);
  doc.pipe(res);

  doc
    .fontSize(16)
    .text('CheckIn - Attendance Report')
    .fontSize(10)
    .fillColor('#555')
    .text(`College of Science and Technology - ${m.code} ${m.name}`)
    .text(`${sessions} sessions - at risk below ${AT_RISK_PCT}% - generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`)
    .moveDown();

  const cols = [['Student ID', 40], ['Name', 120], ['Theory %', 300], ['Practical %', 360], ['Overall %', 430], ['Status', 490]];
  const line = (vals, bold) => {
    if (doc.y > 780) doc.addPage();
    const y = doc.y;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#000');
    cols.forEach(([, x], i) =>
      doc.text(vals[i] == null ? '-' : String(vals[i]), x, y, { width: i === 1 ? 175 : 60, lineBreak: false })
    );
    doc.moveDown(0.6);
  };

  line(cols.map((c) => c[0]), true);
  rows.forEach((r) => line([r.userId, r.name, r.theory, r.practical, r.total, riskLabel(r.total)]));
  doc.end();
}));

/* ---------- Reports & analytics ---------- */

// Per module: last 6 weeks % and overall %
app.get('/api/teacher/reports', auth('teacher'), wrap(async (req, res) => {
  const out = [];
  const seen = new Set();
  const WEEK = 6048e5;

  for (const sec of await prisma.section.findMany({ where: { tutorId: req.user.id }, include: { module: true } })) {
    if (seen.has(sec.moduleId)) continue;
    seen.add(sec.moduleId);

    const ses = await sessionsOf(sec.moduleId);
    const n = await prisma.enrollment.count({ where: { moduleId: sec.moduleId } });
    const att = await prisma.attendance.findMany({ where: { sessionId: { in: ses.map((x) => x.id) }, status: { in: OK } } });

    const weeks = Array.from({ length: 6 }, (_, i) => {
      const start = Date.now() - (6 - i) * WEEK;
      const end = start + WEEK;
      const set = new Set(ses.filter((x) => at(x) >= start && at(x) < end).map((x) => x.id));
      return set.size && n ? Math.round((att.filter((t) => set.has(t.sessionId)).length / (set.size * n)) * 100) : 0;
    });

    out.push({
      code: sec.module.code,
      name: sec.module.name,
      weeks,
      overall: ses.length * n ? Math.round((att.length / (ses.length * n)) * 100) : 0,
    });
  }
  res.json(out);
}));

/* =====================================================================
   10. Evidence documents (review: teacher / admin / management)
   ===================================================================== */
app.get('/api/evidence', auth('teacher', 'admin', 'management'), wrap(async (req, res) => {
  const where = {
    ...(req.query.status && { status: cap(req.query.status) }),
    ...(req.user.role === 'teacher' && { module: { sections: { some: { tutorId: req.user.id } } } }),
  };
  const l = await prisma.evidenceDocument.findMany({ where, include: { student: true, module: true }, orderBy: { createdAt: 'desc' } });
  res.json(l.map((r) => ({
    _id: r.id,
    student: { name: r.student.name, userId: r.student.id },
    module: { name: r.module.name, code: r.module.code },
    date: r.date,
    reason: r.reason,
    fileUrl: r.documentUrl,
    status: r.status.toLowerCase(),
  })));
}));

app.get('/api/evidence/:id', auth('student', 'teacher', 'admin', 'management'), wrap(async (req, res) => {
  const r = await prisma.evidenceDocument.findUnique({
    where: { id: req.params.id },
    include: { student: true, reviewer: true, module: { include: { sections: true } } },
  });
  if (!r) throw Error('Request not found');

  const notOwner = req.user.role === 'student' && r.studentId !== req.user.id;
  const notTutor = req.user.role === 'teacher' && !r.module.sections.some((x) => x.tutorId === req.user.id);
  if (notOwner || notTutor) return res.status(403).json({ error: 'Not allowed for your role' });

  res.json({
    _id: r.id,
    type: (r.leaveType || '').toLowerCase(),
    date: r.date,
    reason: r.reason,
    fileUrl: r.documentUrl,
    fileName: r.originalFilename,
    status: r.status.toLowerCase(),
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
    reviewer: r.reviewer ? { userId: r.reviewer.id, name: r.reviewer.name } : null,
    student: { userId: r.student.id, name: r.student.name },
    module: { name: r.module.name, code: r.module.code },
  });
}));

app.patch('/api/evidence/:id', auth('teacher', 'admin', 'management'), wrap(async (req, res) => {
  if (!['approved', 'rejected'].includes(req.body.status)) throw Error('Invalid status');

  const r = await prisma.evidenceDocument.update({
    where: { id: req.params.id },
    data: { status: cap(req.body.status), reviewedBy: req.user.id, reviewedAt: new Date() },
  });

  // Approved: mark the student present for every session of that module on that date
  if (req.body.status === 'approved') {
    for (const se of await prisma.classSession.findMany({ where: { date: r.date, section: { moduleId: r.moduleId } } })) {
      await prisma.attendance.upsert({
        where: { studentId_sessionId: { studentId: r.studentId, sessionId: se.id } },
        update: { status: 'Present' },
        create: { studentId: r.studentId, sessionId: se.id, status: 'Present' },
      });
    }
  }

  await notify(r.studentId, `Your absence request was ${req.body.status}.`, 'Evidence Documents');
  res.json({ _id: r.id, status: req.body.status });
}));

/* =====================================================================
   11. Admin
   ===================================================================== */
app.get('/api/admin/overview', auth('admin', 'management'), wrap(async (req, res) => {
  res.json({
    students: await prisma.user.count({ where: { role: 'student' } }),
    newStudents: await prisma.user.count({ where: { role: 'student', createdAt: { gte: monthStart() } } }),
    tutors: await prisma.user.count({ where: { role: 'tutor', isActive: true } }),
    programs: await prisma.program.count(),
    modules: await prisma.module.count(),
  });
}));

/* ---------- Programmes ---------- */
app.get('/api/admin/programs', auth('admin', 'management'), wrap(async (req, res) => {
  res.json((await prisma.program.findMany({ orderBy: { name: 'asc' } })).map((p) => p.name));
}));

app.post('/api/admin/programs', auth('admin'), wrap(async (req, res) => {
  const p = await prisma.program.create({ data: { name: req.body.name } });
  await audit(req.user.id, 'Created program', req.body.name);
  res.json(p);
}));

app.put('/api/admin/programs', auth('admin'), wrap(async (req, res) => {
  const { from, to } = req.body;
  await prisma.program.updateMany({ where: { name: from }, data: { name: to } });
  await prisma.user.updateMany({ where: { department: from }, data: { department: to } });
  await audit(req.user.id, 'Renamed program', `${from} -> ${to}`);
  res.json({ message: 'Renamed' });
}));

app.get('/api/admin/programmes/:name/export.csv', auth('admin', 'management'), wrap(async (req, res) => {
  const studs = await prisma.user.findMany({ where: { role: 'student', department: req.params.name }, orderBy: { id: 'asc' } });
  const rows = [];
  for (const u of studs) {
    const p = await overall(u.id);
    rows.push([u.id, u.name, u.programme, p, p < AT_RISK_PCT ? 'At risk' : 'OK']);
  }
  sendCsv(
    res,
    `${req.params.name.replace(/[^\w.-]+/g, '_')}-report.csv`,
    ['Student ID', 'Name', 'Programme', 'Overall %', 'Status'],
    rows
  );
}));

/* ---------- Users ---------- */
// ?programme= matches users whose programme (or, for older accounts, department) is that programme
app.get('/api/admin/users', auth('admin'), wrap(async (req, res) => {
  const { role = 'student', department, programme, year } = req.query;
  const where = { role: roleIn(role), AND: [] };
  if (department) where.AND.push({ department });
  if (programme) where.AND.push({ OR: [{ programme }, { department: programme }] });
  if (year) where.AND.push({ OR: +year === 1 ? [{ year: 1 }, { year: null }] : [{ year: +year }] });

  const users = await prisma.user.findMany({ where, orderBy: { name: 'asc' } });
  res.json(await Promise.all(users.map(async (x) => ({
    ...userOut(x),
    ...(role === 'student' && { pct: await overall(x.id) }),
  }))));
}));

app.patch('/api/admin/users/:id', auth('admin'), wrap(async (req, res) => {
  const data = {};
  if (req.body.active !== undefined) {
    data.isActive = req.body.active;
    data.status = req.body.active ? 'active' : 'inactive';
  }
  if (req.body.name) data.name = req.body.name;

  const u = await prisma.user.update({ where: { id: req.params.id }, data });
  const action = req.body.active === undefined ? 'Edited user' : req.body.active ? 'Activated user' : 'Deactivated user';
  await audit(req.user.id, action, u.id);
  res.json(userOut(u));
}));

/* ---------- Tutor approvals ---------- */
app.get('/api/admin/tutors/pending', auth('admin', 'management'), wrap(async (req, res) => {
  const l = await prisma.user.findMany({
    where: { role: 'tutor', isActive: false, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });
  res.json(l.map(userOut));
}));

app.post('/api/admin/tutors/:id/approve', auth('admin'), wrap(async (req, res) => {
  const u = await prisma.user.findFirst({ where: { id: req.params.id, role: 'tutor' } });
  if (!u) throw Error('Tutor request not found');
  if (u.isActive) throw Error('This tutor is already active');

  await prisma.user.update({ where: { id: u.id }, data: { isActive: true, status: 'active' } });
  await notify(u.id, 'Your tutor account has been approved. You can now sign in.', 'System');
  await audit(req.user.id, 'Tutor Approved', `${u.name} (${u.id})`);
  res.json({ userId: u.id, status: 'active' });
}));

app.post('/api/admin/tutors/:id/reject', auth('admin'), wrap(async (req, res) => {
  const u = await prisma.user.findFirst({ where: { id: req.params.id, role: 'tutor' } });
  if (!u) throw Error('Tutor request not found');
  if (u.isActive || u.status !== 'active') throw Error('Only pending tutor requests can be rejected');

  await prisma.user.update({ where: { id: u.id }, data: { status: 'inactive' } });
  await audit(req.user.id, 'Tutor Rejected', `${u.name} (${u.id})`);
  res.json({ userId: u.id, status: 'inactive' });
}));

/* ---------- Modules (admin assigns the tutor here) ---------- */
app.get('/api/admin/modules', auth('admin'), wrap(async (req, res) => {
  const { department, year, semester } = req.query;
  // filter through program_modules so shared modules show under every programme
  const cur = {
    ...(department && { program: { name: department } }),
    ...(year && { year: +year }),
    ...(semester && { semester: +semester }),
  };
  const l = await prisma.module.findMany({
    where: Object.keys(cur).length ? { curriculum: { some: cur } } : {},
    include: { sections: { include: { tutor: true }, take: 1 } },
    orderBy: { code: 'asc' },
  });
  res.json(l.map((m) => ({
    _id: m.id,
    name: m.name,
    code: m.code,
    count: m.moduleCount,
    tutor: m.sections[0] ? { userId: m.sections[0].tutor.id, name: m.sections[0].tutor.name } : null,
  })));
}));

// Create or update a module; if tutorId is given, assign that tutor to the module's section
const saveModule = async (id, b) => {
  let program = await prisma.program.findFirst({ where: { name: b.department } });
  if (!program) program = await prisma.program.create({ data: { name: b.department } });

  const data = {
    name: b.name,
    code: b.code,
    programId: program.id,
    year: +b.year || null,
    semester: +b.semester || null,
    moduleCount: +b.count || null,
  };
  // on update keep the module's original programme; the link is stored in program_modules
  const m = id ? await prisma.module.update({ where: { id }, data: { ...data, programId: undefined } }) : await prisma.module.create({ data });
  if (data.year && data.semester) {
    await prisma.programModule.upsert({
      where: { programId_moduleId: { programId: program.id, moduleId: m.id } },
      update: { year: data.year, semester: data.semester },
      create: { programId: program.id, moduleId: m.id, year: data.year, semester: data.semester },
    });
  }

  if (b.tutorId) {
    const t = await prisma.user.findFirst({ where: { id: b.tutorId, role: 'tutor' } });
    if (!t) throw Error('Tutor not found');
    const sec = await prisma.section.findFirst({ where: { moduleId: m.id } });
    if (sec) await prisma.section.update({ where: { id: sec.id }, data: { tutorId: t.id } });
    else await prisma.section.create({ data: { moduleId: m.id, tutorId: t.id, name: 'A' } });
  }
  return m;
};

app.post('/api/admin/modules', auth('admin'), wrap(async (req, res) => {
  const m = await saveModule(null, req.body);
  await audit(req.user.id, 'Created module', m.code);
  res.json({ _id: m.id });
}));

app.put('/api/admin/modules/:id', auth('admin'), wrap(async (req, res) => {
  const m = await saveModule(req.params.id, req.body);
  await audit(req.user.id, 'Updated module', m.code);
  res.json({ _id: m.id });
}));

/* ---------- Audit log ---------- */
app.get('/api/admin/audit-logs', auth('admin', 'management'), wrap(async (req, res) => {
  const { action, from, to, q: text } = req.query;
  const where = { ...(action && { action }) };
  if (from || to) {
    where.timestamp = {
      ...(from && { gte: new Date(from) }),
      ...(to && { lt: new Date(new Date(to).getTime() + 864e5) }),
    };
  }
  if (text) {
    where.OR = [
      { details: { contains: text, mode: 'insensitive' } },
      { admin: { name: { contains: text, mode: 'insensitive' } } },
    ];
  }
  const l = await prisma.auditLog.findMany({
    where,
    include: { admin: true },
    orderBy: { timestamp: 'desc' },
    take: Math.min(+req.query.limit || 100, 500),
  });
  res.json(l.map((x) => ({
    _id: x.id,
    action: x.action,
    details: x.details,
    time: x.timestamp,
    admin: { userId: x.admin.id, name: x.admin.name },
  })));
}));

app.get('/api/admin/audit-actions', auth('admin', 'management'), wrap(async (req, res) => {
  const l = await prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } });
  res.json(l.map((x) => x.action));
}));

/* ---------- At-risk students ---------- */
const atRisk = async (below, department) => {
  const en = await prisma.enrollment.findMany({
    where: { student: { role: 'student', ...(department && { department }) } },
    include: { student: true, module: true },
  });
  const cache = {};
  const out = [];

  for (const e of en) {
    const ses = cache[e.moduleId] || (cache[e.moduleId] = await sessionsOf(e.moduleId));
    if (!ses.length) continue;
    const p = Math.round(((await attended(e.studentId, ses.map((x) => x.id))).length / ses.length) * 1000) / 10;
    if (p < below) {
      out.push({
        userId: e.student.id,
        name: e.student.name,
        department: e.student.department,
        module: { id: e.moduleId, code: e.module.code, name: e.module.name },
        pct: p,
        sessions: ses.length,
      });
    }
  }
  return out.sort((a, b) => a.pct - b.pct);
};

app.get('/api/admin/reports/at-risk', auth('admin', 'management'), wrap(async (req, res) => {
  const below = +req.query.below || AT_RISK_PCT;
  res.json({ threshold: below, rows: await atRisk(below, req.query.department) });
}));

app.get('/api/admin/reports/at-risk/export.csv', auth('admin', 'management'), wrap(async (req, res) => {
  const rows = await atRisk(+req.query.below || AT_RISK_PCT, req.query.department);
  sendCsv(
    res,
    'at-risk-students.csv',
    ['Student ID', 'Name', 'Department', 'Module code', 'Module', 'Attendance %', 'Sessions'],
    rows.map((r) => [r.userId, r.name, r.department, r.module.code, r.module.name, r.pct, r.sessions])
  );
}));

/* ---------- Low-attendance alert job ---------- */
app.post('/api/admin/jobs/low-attendance', auth('admin'), wrap(async (req, res) => {
  const cutoff = new Date(Date.now() - REALERT_DAYS * 864e5);
  const result = { scanned: 0, alerts: 0, skipped: 0 };
  const cache = {};
  const en = await prisma.enrollment.findMany({
    where: { student: { role: 'student', isActive: true } },
    include: { module: true },
  });

  for (const e of en) {
    const ses = cache[e.moduleId] || (cache[e.moduleId] = await sessionsOf(e.moduleId));
    if (!ses.length) continue;
    result.scanned++;

    const p = Math.round(((await attended(e.studentId, ses.map((x) => x.id))).length / ses.length) * 100);
    if (p >= REQUIRED_PCT) continue;

    const recent = await prisma.notification.findFirst({
      where: { userId: e.studentId, category: 'Attendance', createdAt: { gte: cutoff }, message: { contains: e.module.code } },
    });
    if (recent) {
      result.skipped++;
      continue;
    }

    await notify(
      e.studentId,
      `Your attendance in ${e.module.code} is ${p}% - below the ${REQUIRED_PCT}% requirement. Please speak to your tutor.`,
      'Attendance'
    );
    result.alerts++;
  }

  await audit(req.user.id, 'Low-attendance job', `${result.alerts} alerts sent, ${result.skipped} skipped`);
  res.json(result);
}));

/* =====================================================================
   12. Management
   ===================================================================== */
const mg = auth('management', 'admin');

const deptStats = async (name) => {
  const mods = await prisma.module.findMany({ where: { program: { name } } });
  let expected = 0;
  let present = 0;
  for (const m of mods) {
    const ses = await sessionsOf(m.id);
    expected += ses.length * (await prisma.enrollment.count({ where: { moduleId: m.id } }));
    present += await prisma.attendance.count({ where: { sessionId: { in: ses.map((x) => x.id) }, status: { in: OK } } });
  }
  return { mods, exp: expected, pres: present };
};

app.get('/api/management/overview', mg, wrap(async (req, res) => {
  const departments = [];
  for (const p of await prisma.program.findMany({ orderBy: { name: 'asc' } })) {
    const d = await deptStats(p.name);
    departments.push({
      department: p.name,
      students: await prisma.user.count({ where: { role: 'student', department: p.name } }),
      modules: d.mods.length,
      attendance: d.exp ? Math.round((d.pres / d.exp) * 1000) / 10 : 0,
    });
  }

  res.json({
    totals: {
      students: await prisma.user.count({ where: { role: 'student' } }),
      newStudents: await prisma.user.count({ where: { role: 'student', createdAt: { gte: monthStart() } } }),
      tutors: await prisma.user.count({ where: { role: 'tutor', isActive: true } }),
      modules: await prisma.module.count(),
      below80: departments.filter((r) => r.attendance < 80).length,
    },
    departments,
  });
}));

app.get('/api/management/department/:name', mg, wrap(async (req, res) => {
  const { mods } = await deptStats(req.params.name);
  const size = {};
  for (const m of mods) size[m.id] = await prisma.enrollment.count({ where: { moduleId: m.id } });

  const studs = await prisma.user.findMany({ where: { role: 'student', department: req.params.name }, select: { id: true } });
  const pcts = await Promise.all(studs.map((u) => overall(u.id)));
  const ses = await prisma.classSession.findMany({
    where: { section: { moduleId: { in: mods.map((m) => m.id) } } },
    include: { section: true },
  });
  const att = await prisma.attendance.findMany({
    where: { sessionId: { in: ses.map((x) => x.id) }, status: { in: OK } },
    select: { sessionId: true },
  });

  const WEEK = 6048e5;
  const trend = Array.from({ length: 6 }, (_, i) => {
    const start = Date.now() - (6 - i) * WEEK;
    const end = start + WEEK;
    const week = ses.filter((x) => at(x) >= start && at(x) < end);
    const set = new Set(week.map((x) => x.id));
    const expected = week.reduce((t, x) => t + size[x.section.moduleId], 0);
    return expected ? Math.round((att.filter((t) => set.has(t.sessionId)).length / expected) * 1000) / 10 : 0;
  });

  res.json({
    students: studs.length,
    avg: pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : 0,
    atRisk: pcts.filter((p) => p < 80).length,
    trend,
    modules: mods.map((m) => ({ id: m.id, name: m.name, code: m.code, year: m.year })),
  });
}));

app.get('/api/management/module/:id', mg, wrap(async (req, res) => {
  const m = await prisma.module.findUnique({ where: { id: req.params.id } });
  const ses = await sessionsOf(m.id);
  const en = await prisma.enrollment.findMany({ where: { moduleId: m.id }, include: { student: true } });
  const att = await prisma.attendance.findMany({ where: { sessionId: { in: ses.map((x) => x.id) }, status: { in: OK } } });

  const rows = en.map(({ student: u }) => {
    const got = new Set(att.filter((a) => a.studentId === u.id).map((a) => a.sessionId));
    const missed = ses.filter((x) => !got.has(x.id));
    return {
      id: u.id,
      userId: u.id,
      name: u.name,
      absences: missed.length,
      absentH: missed.reduce((t, x) => t + x.duration / 60, 0),
      pct: ses.length ? Math.round((got.size / ses.length) * 1000) / 10 : 0,
    };
  });

  res.json({
    module: { name: m.name, code: m.code },
    totals: {
      students: rows.length,
      absence: rows.reduce((t, r) => t + r.absences, 0),
      evidence: await prisma.evidenceDocument.count({ where: { moduleId: m.id, status: 'Approved' } }),
    },
    rows,
  });
}));

app.get('/api/management/student/:id', mg, wrap(async (req, res) => {
  const st = await prisma.user.findUnique({ where: { id: req.params.id } });
  const ses = await sessionsOf(req.query.module);
  const got = new Set((await attended(st.id, ses.map((x) => x.id))).map((a) => a.sessionId));
  const history = ses.map((x) => ({ date: at(x), status: got.has(x.id) ? 'present' : 'absent' }));
  const present = history.filter((h) => h.status === 'present').length;

  res.json({
    student: { userId: st.id, name: st.name },
    present,
    absent: history.length - present,
    total: history.length,
    pct: history.length ? Math.round((present / history.length) * 100) : 0,
    history,
  });
}));

app.get('/api/management/teachers', mg, wrap(async (req, res) => {
  const rows = [];
  for (const x of await prisma.section.findMany({ include: { module: true, tutor: true, sessions: true } })) {
    rows.push({
      module: `${x.module.code} – ${x.module.name}`,
      name: x.tutor.name,
      cls: x.name,
      hours: x.sessions.reduce((t, y) => t + y.duration / 60, 0),
    });
  }
  res.json({ total: await prisma.user.count({ where: { role: 'tutor', isActive: true } }), rows });
}));

app.get('/api/management/history', mg, wrap(async (req, res) => {
  const { q: text, year, semester, department } = req.query;
  const rows = [];
  const mods = await prisma.module.findMany({
    where: {
      ...(year && { year: +year }),
      ...(semester && { semester: +semester }),
      ...(department && { program: { name: department } }),
    },
    include: { enrollments: { include: { student: true } }, sections: { include: { tutor: true }, take: 1 } },
  });

  for (const m of mods) {
    for (const { student: u } of m.enrollments) {
      if (text && !((u.name || '') + u.id).toLowerCase().includes(text.toLowerCase())) continue;
      rows.push({
        sid: u.id,
        mid: m.id,
        name: u.name,
        userId: u.id,
        module: `${m.code} – ${m.name}`,
        teacher: m.sections[0]?.tutor.name,
        pct: await pct(u.id, m.id),
      });
    }
  }
  res.json(rows);
}));

app.get('/api/management/calendar', mg, wrap(async (req, res) => {
  res.json(await monthDays(req.query.student, [req.query.module], req.query.month));
}));

/* =====================================================================
   12b. Unenrolment, rooms and the fixed weekly timetable
   ===================================================================== */

// Remove a student from a module (tutor of the module, or admin)
app.delete('/api/modules/:id/students/:studentId', auth('teacher', 'admin'), wrap(async (req, res) => {
  if (req.user.role === 'teacher' && !(await mine(req.params.id, req.user.id))) throw Error('This is not your module');
  const m = await prisma.module.findUnique({ where: { id: req.params.id } });
  if (!m) throw Error('Module not found');
  const r = await prisma.enrollment.deleteMany({ where: { moduleId: m.id, studentId: req.params.studentId } });
  if (!r.count) throw Error('That student is not enrolled in this module');
  await notify(req.params.studentId, `You were removed from ${m.code} - ${m.name}.`, 'System');
  if (req.user.role === 'admin') await audit(req.user.id, 'Student Unenrolled', `${req.params.studentId} from ${m.code}`);
  res.json({ message: 'Student removed from the module' });
}));

const DAY = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hhmm = (t) => t.toISOString().slice(11, 16);
const slotOut = (x) => ({
  id: x.id, day: DAY[x.dayOfWeek], dayOfWeek: x.dayOfWeek, start: hhmm(x.startTime), end: hhmm(x.endTime),
  year: x.year, semester: x.semester, programme: x.program?.name,
  module: { id: x.moduleId, code: x.moduleCode, name: x.module?.name || x.moduleCode },
  type: x.sessionType, group: x.groupLabel,
  room: x.room ? { id: x.room.id, name: x.room.name, location: x.room.location } : null,
  tutors: x.tutorNames, note: x.note,
});
const slotInclude = { program: true, module: true, room: true };
const slotOrder = [{ dayOfWeek: 'asc' }, { startTime: 'asc' }];

app.get('/api/rooms', auth(), wrap(async (req, res) => res.json(await prisma.room.findMany({ orderBy: { name: 'asc' } }))));

// Whole timetable for a programme + year (any logged-in user)
app.get('/api/timetable', auth(), wrap(async (req, res) => {
  const { program, year } = req.query;
  if (!program || !year) throw Error('Choose a programme and year');
  res.json((await prisma.timetableSlot.findMany({ where: { program: { name: program }, year: +year }, include: slotInclude, orderBy: slotOrder })).map(slotOut));
}));

// A student's own weekly timetable (from their programme and year)
app.get('/api/student/timetable', auth('student'), wrap(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!u.programme) throw Error('Your programme is not set in your profile');
  res.json((await prisma.timetableSlot.findMany({ where: { program: { name: u.programme }, year: u.year || 1 }, include: slotInclude, orderBy: slotOrder })).map(slotOut));
}));

// A tutor's own weekly timetable: slots linked to their account, or listing their name
app.get('/api/teacher/timetable', auth('teacher'), wrap(async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.user.id } });
  res.json((await prisma.timetableSlot.findMany({
    where: { OR: [{ tutorId: u.id }, ...(u.name ? [{ tutorNames: { contains: u.name, mode: 'insensitive' } }] : [])] },
    include: slotInclude, orderBy: slotOrder,
  })).map(slotOut));
}));

/* =====================================================================
   13. Start the server
   ===================================================================== */
const runSweep = () => sweepExpiredSessions().catch((e) => console.error('Session sweep failed:', e.message));
setInterval(runSweep, 60 * 1000); // close expired sessions every minute

app.listen(process.env.PORT || 5000, () => {
  console.log('CheckIn API ready (PostgreSQL + Prisma)');
  runSweep();
});