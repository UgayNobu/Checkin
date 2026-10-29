// Entry point: start the HTTP server and shut down cleanly.
const { createApp } = require('./app');
const { env } = require('./config/env');
const { prisma } = require('./lib/prisma');
const { isSmtpConfigured, verifyMail } = require('./lib/mailer');

const { sweepExpiredSessions } = require('./services/session.service');
const { runLowAttendanceJob } = require('./services/admin.service');
const { autoCancel } = require('./services/classChange.service');

const server = createApp().listen(env.port, () => {
  console.log(`CheckIn API ready on http://localhost:${env.port} (PostgreSQL + Prisma)`);
  // Open the database connection now, so the first page doesn't wait for it.
  prisma.$connect().then(runSweep).catch((e) => console.error('Database connection failed:', e.message));
  // Say straight away whether emails (reset codes, notifications) will work.
  if (isSmtpConfigured()) {
    verifyMail().then((r) => (r.ok
      ? console.log(`Email ready: sending via ${r.via}`)
      : console.warn(`Email NOT working: ${r.error}`)));
  } else {
    console.log('Email not set up (no BREVO_API_KEY or SMTP_HOST in .env): reset codes are printed here instead.');
  }
});

// Every minute: close sessions whose code has run out and mark the students who didn't check in as Absent.
const runSweep = () => sweepExpiredSessions().catch((e) => console.error('Session sweep failed:', e.message));
const sweepTimer = setInterval(runSweep, 60 * 1000);

// Once a day (first run 2 minutes after start): students under the required % get an alert,
// and each tutor gets one message per module listing them. Nobody is alerted twice within
// LOW_ATTENDANCE_REALERT_DAYS, so restarting the server doesn't spam anyone.
const runAlerts = () => runLowAttendanceJob(null)
  .then((r) => r.alerts && console.log(`Low-attendance alerts: ${r.alerts} students, ${r.tutorAlerts || 0} tutor messages`))
  .catch((e) => console.error('Low-attendance job failed:', e.message));
const alertStart = setTimeout(runAlerts, 2 * 60 * 1000);
const alertTimer = setInterval(runAlerts, 24 * 60 * 60 * 1000);

// Every 5 minutes: timetable classes that ended without the tutor starting attendance
// are marked cancelled ("Not started by the tutor"), so nobody is marked absent.
const runAutoCancel = () => autoCancel({ force: true })
  .then((n) => n && console.log(`Auto-cancelled ${n} class${n === 1 ? '' : 'es'} nobody started`))
  .catch((e) => console.error('Auto-cancel failed:', e.message));
const autoStart = setTimeout(runAutoCancel, 15 * 1000);
const autoTimer = setInterval(runAutoCancel, 5 * 60 * 1000);

const shutdown = (signal) => {
  console.log(`${signal} received, closing…`);
  clearInterval(sweepTimer);
  clearTimeout(alertStart);
  clearInterval(alertTimer);
  clearTimeout(autoStart);
  clearInterval(autoTimer);
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
