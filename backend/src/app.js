// ─────────────────────────────────────────────────────────────
// Builds the Express app: security → parsing → health → feature
// routers → 404 → error handler. server.js only starts it.
// ─────────────────────────────────────────────────────────────
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const { env } = require('./config/env');
const { LOCAL_DIR } = require('./lib/storage');
const { apiLimiter } = require('./middleware/rateLimits');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const profileRoutes = require('./routes/profile.routes');
const notificationRoutes = require('./routes/notifications.routes');
const studentRoutes = require('./routes/student.routes');
const moduleRoutes = require('./routes/modules.routes');
const { attendanceRouter, checkinRouter } = require('./routes/attendance.routes');
const sessionRoutes = require('./routes/session.routes');
const tutorRoutes = require('./routes/tutor.routes');
const evidenceRoutes = require('./routes/evidence.routes');
const adminRoutes = require('./routes/admin.routes');
const managementRoutes = require('./routes/management.routes');
const catalogRoutes = require('./routes/catalog.routes');
const fileRoutes = require('./routes/files.routes');
const classChangeRoutes = require('./routes/classChange.routes');
function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render sits behind a proxy; needed for rate limits + secure cookies

  // ── Security
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || env.frontendUrls.includes(origin) || !env.isProd), // any origin in dev
    credentials: true, // allow the auth cookie
  }));

  // ── Parsing / logging
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (env.nodeEnv !== 'test') app.use(morgan(env.isProd ? 'combined' : 'dev'));

  // ── Health (no auth, no rate limit) — used by Render and the CI pipeline
  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'checkin-backend', time: new Date().toISOString() }));

  // ── Uploaded files (only used when Supabase Storage isn't configured)
  app.use('/uploads', express.static(LOCAL_DIR));

  // ── API
  app.use('/api', apiLimiter);
  app.get('/api', (req, res) => res.json({ name: 'CheckIn API', version: '3.0.0' }));
  app.use('/api/files', fileRoutes);
  app.use('/api/auth', authRoutes);
  app.use(['/api/me', '/api/profile'], profileRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/student', studentRoutes);
  app.use('/api/modules', moduleRoutes);
  app.use('/api/attendance', attendanceRouter);
  app.use('/api/checkin', checkinRouter);
  app.use('/api/sessions', sessionRoutes);
  app.use(['/api/teacher', '/api/tutor'], tutorRoutes);
  app.use('/api/evidence', evidenceRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/management', managementRoutes);
  app.use('/api/class-changes', classChangeRoutes);
  app.use('/api', catalogRoutes); // /departments, /programs, /rooms, /timetable

  // ── 404 + errors (always last)
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
