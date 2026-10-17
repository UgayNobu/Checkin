const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.log('Usage: node scripts/set-test-passwords.js <password>');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  const result = await prisma.user.updateMany({
    data: { passwordHash: hash },
  });

  console.log('Updated ' + result.count + ' users');
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
