// ─────────────────────────────────────────────────────────────
// Loads the college roster from a CSV so people can sign up by ID
// (they only choose a password — name/email come from here).
//
// Usage: node scripts/import-roster.js roster.csv
// CSV header: userId,name,email,role,programme,department,year
//   role = student | teacher   (teacher is stored as 'tutor')
// Existing users are left untouched; new ones get no password yet.
// ─────────────────────────────────────────────────────────────
require('dotenv').config();
const fs = require('fs');
const { prisma } = require('../src/lib/prisma');

// Minimal CSV parser that understands quoted fields.
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

(async () => {
  const file = process.argv[2];
  if (!file) { console.log('Usage: node scripts/import-roster.js roster.csv'); process.exit(1); }
  const [header, ...lines] = parseCsv(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const col = (name) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const idx = { userId: col('userId'), name: col('name'), email: col('email'), role: col('role'), programme: col('programme'), department: col('department'), year: col('year') };
  if (idx.userId < 0 || idx.email < 0) throw new Error('CSV needs at least userId and email columns');

  let created = 0, skipped = 0;
  for (const l of lines) {
    const get = (k) => (idx[k] >= 0 ? (l[idx[k]] || '').trim() : '');
    const id = get('userId').toUpperCase();
    if (!id) continue;
    if (await prisma.user.findUnique({ where: { id } })) { skipped++; continue; }
    const role = get('role').toLowerCase() === 'teacher' || get('role').toLowerCase() === 'tutor' ? 'tutor' : 'student';
    await prisma.user.create({
      data: {
        id, name: get('name') || null, email: get('email').toLowerCase(), role, programme: get('programme') || null,
        department: get('department') || null, year: role === 'student' ? +get('year') || 1 : null,
        passwordHash: null, isActive: role === 'student', status: 'active',
      },
    });
    created++;
  }
  console.log(`Roster imported: ${created} new, ${skipped} already existed.`);
})()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
