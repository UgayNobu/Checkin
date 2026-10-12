// One shared Prisma client for the whole app (opening many clients exhausts DB connections).
const { PrismaClient } = require('@prisma/client');
const userCache = require('../utils/userCache');

const prisma = global.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.__prisma = prisma; // survive `node --watch` restarts

// Any write to the users table clears the login cache, so a deactivated
// account loses access straight away (see utils/userCache.js).
if (!prisma.__userCacheHook) {
  const WRITES = new Set(['create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
  prisma.$use(async (params, next) => {
    const result = await next(params);
    if (params.model === 'User' && WRITES.has(params.action)) userCache.clear();
    return result;
  });
  prisma.__userCacheHook = true;
}

module.exports = { prisma };
