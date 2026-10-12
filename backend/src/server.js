// Entry point: start the HTTP server and shut down cleanly.
const { createApp } = require('./app');
const { env } = require('./config/env');
const { prisma } = require('./lib/prisma');

const { sweepExpiredSessions } = require('./services/session.service');

const server = createApp().listen(env.port, () => {
  console.log(`CheckIn API ready on http://localhost:${env.port} (PostgreSQL + Prisma)`);
  // Open the database connection now, so the first page doesn't wait for it.
  prisma.$connect().then(runSweep).catch((e) => console.error('Database connection failed:', e.message));
});

// Every minute: close sessions whose code has run out and mark the students who didn't check in as Absent.
const runSweep = () => sweepExpiredSessions().catch((e) => console.error('Session sweep failed:', e.message));
const sweepTimer = setInterval(runSweep, 60 * 1000);

const shutdown = (signal) => {
  console.log(`${signal} received, closing…`);
  clearInterval(sweepTimer);
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
