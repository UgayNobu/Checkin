// Entry point: start the HTTP server and shut down cleanly.
const { createApp } = require('./app');
const { env } = require('./config/env');
const { prisma } = require('./lib/prisma');

const server = createApp().listen(env.port, () => console.log(`CheckIn API ready on http://localhost:${env.port} (PostgreSQL + Prisma)`));

const shutdown = (signal) => {
  console.log(`${signal} received, closing…`);
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
