// Loads the team's real CheckIn data (SEED DATA part of prisma/database.sql) into the database.
// Run from the backend folder AFTER the schema is in place:  npm run seed
// Safe to run again: rows that already exist are skipped, nothing is overwritten.
require('dotenv').config();
const fs = require('fs'), path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const file = fs.readFileSync(path.join(__dirname, 'prisma', 'database.sql'), 'utf8'), marker = '-- ===== SEED DATA';
  if (!file.includes(marker)) throw Error('SEED DATA marker not found in prisma/database.sql');
  const sql = file.slice(file.indexOf(marker))
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  const statements = sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
  await prisma.$transaction(statements.map((s) => prisma.$executeRawUnsafe(s)));
  console.log(`Seeded real data (${statements.length} statements). Existing rows were left as they were.`);
})()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
