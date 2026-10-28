// Exit 0 if the database already has the CheckIn tables, 1 if it is empty.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.$queryRaw`SELECT to_regclass('public.users')::text AS t`
  .then((r) => { process.exitCode = r[0].t ? 0 : 1; })
  .catch((e) => { console.error(e.message); process.exitCode = 2; })
  .finally(() => prisma.$disconnect());
