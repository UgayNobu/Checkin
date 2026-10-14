// Creates (or resets) an admin or management account.
// Usage: node scripts/create-admin.js <userId> <email> "<name>" <password> [admin|management]
require('dotenv').config();
const { prisma } = require('../src/lib/prisma');
const { hashPassword, isStrongPassword, PASSWORD_RULE } = require('../src/utils/password');

(async () => {
  const [userId, email, name, password, role = 'admin'] = process.argv.slice(2);
  if (!userId || !email || !name || !password) {
    console.log('Usage: node scripts/create-admin.js <userId> <email> "<name>" <password> [admin|management]');
    process.exit(1);
  }
  if (!['admin', 'management'].includes(role)) throw new Error('Role must be admin or management');
  if (!isStrongPassword(password)) throw new Error(PASSWORD_RULE);
  const id = userId.trim().toUpperCase(), passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { id },
    update: { email, name, role, passwordHash, isActive: true, status: 'active' },
    create: { id, email, name, role, passwordHash, isActive: true, status: 'active' },
  });
  console.log(`${role} account ${id} is ready.`);
})()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
