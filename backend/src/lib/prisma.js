// One shared Prisma client for the whole app (opening many clients exhausts DB connections).
const { PrismaClient } = require('@prisma/client');

const prisma = global.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.__prisma = prisma; // survive `node --watch` restarts

module.exports = { prisma };
