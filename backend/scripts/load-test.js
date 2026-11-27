#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// Load test: can CheckIn take a whole college checking in at once?
//
//   node scripts/load-test.js [students=1000] [seconds=120]
//
// Runs ONLY against a local copy (DATABASE_URL on localhost / 127.0.0.1 and the API on
// http://localhost:5001), never the live site or Supabase. It:
//   1. adds N test students (LT0001…) enrolled in one module, and opens two check-in sessions
//   2. "Spread":  N check-ins sent over the given seconds (a real 9 a.m. rush: the 2-minute window)
//   3. "Burst":   N check-ins with up to 100 at the same moment (the worst case)
//   4. prints response times (median, 95th percentile, slowest) and errors, then
//   5. removes everything it added.
// Students are given login tokens directly (as if already logged in on their phones), so the
// test measures check-in itself; 50 real logins are timed separately because logins are slow
// on purpose (bcrypt password hashing).
// ─────────────────────────────────────────────────────────────
require('dotenv').config({ path: process.env.DOTENV || '.env' });
const { prisma } = require('../src/lib/prisma');
const { signAuthToken } = require('../src/utils/jwt');
const { generateCheckInCode } = require('../src/utils/code');
const bcrypt = require('bcryptjs');

const N = Number(process.argv[2] || 1000);
const SECONDS = Number(process.argv[3] || 120);
const API = process.env.LOAD_API || 'http://localhost:5001/api';
const CENTRE = { lat: 26.84812, lng: 89.39233 }; // a point on campus (the workshop circle's centre)
const PASSWORD = 'Load@1234';

const local = (u) => /@(localhost|127\.0\.0\.1)[:/]/.test(u || '') || /\/\/(localhost|127\.0\.0\.1)[:/]/.test(u || '');
if (!local(process.env.DATABASE_URL) || !/^http:\/\/(localhost|127\.0\.0\.1)/.test(API)) {
  console.error('Refusing to run: the load test only runs against a local database and local API.');
  process.exit(1);
}

const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))];
function report(name, times, errors, ms) {
  const t = [...times].sort((a, b) => a - b);
  console.log(`\n${name}: ${times.length + errors.length} requests in ${(ms / 1000).toFixed(1)} s (${((times.length + errors.length) / (ms / 1000)).toFixed(1)} per second)`);
  console.log(`  ok ${times.length}, errors ${errors.length}${errors.length ? ` (${[...new Set(errors)].slice(0, 3).join('; ')})` : ''}`);
  if (t.length) console.log(`  response time: median ${pct(t, 50)} ms, 95% under ${pct(t, 95)} ms, slowest ${t[t.length - 1]} ms`);
  return { requests: times.length + errors.length, ok: times.length, errors: errors.length, median: pct(t, 50), p95: pct(t, 95), max: t[t.length - 1] };
}

async function checkIn(token, code, i) {
  const t0 = Date.now();
  const r = await fetch(`${API}/attendance/checkin`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    // up to ~10 m from the centre, good GPS
    body: JSON.stringify({ code, lat: CENTRE.lat + ((i % 7) - 3) * 0.00002, lng: CENTRE.lng + ((i % 5) - 2) * 0.00002, accuracy: 12, deviceId: `load-device-${i}-xxxx` }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${d.code || d.error || ''}`);
  return Date.now() - t0;
}

async function main() {
  const sec = await prisma.section.findFirst({ where: { academicSession: (await prisma.academicSession.findFirst({ where: { isCurrent: true } })).code } });
  if (!sec) throw new Error('No tutor assignment (section) in the current semester to test with.');
  const ids = Array.from({ length: N }, (_, i) => `LT${String(i + 1).padStart(4, '0')}`);
  console.log(`Adding ${N} test students to ${sec.moduleId} (${sec.academicSession}) …`);
  const hash = await bcrypt.hash(PASSWORD, 10);
  await prisma.user.createMany({
    data: ids.map((id) => ({ id, name: `Load Student ${id}`, email: `${id.toLowerCase()}@load.test`, passwordHash: hash, role: 'student', year: 2 })),
    skipDuplicates: true,
  });
  await prisma.enrollment.createMany({ data: ids.map((studentId) => ({ studentId, moduleId: sec.moduleId, academicSession: sec.academicSession })), skipDuplicates: true });
  const tokens = ids.map((id) => signAuthToken({ id, role: 'student', tokenVersion: 0 }));

  const open = async () => {
    const now = new Date();
    const code = generateCheckInCode();
    const se = await prisma.classSession.create({
      data: {
        sectionId: sec.id, date: now, startTime: now, duration: 60, sessionType: 'practical', status: 'ongoing', counts: false,
        codes: { create: { code, expiryTimestamp: new Date(now.getTime() + (SECONDS + 120) * 1000), geofenceRadius: 30, latitude: CENTRE.lat, longitude: CENTRE.lng } },
      },
    });
    return { id: se.id, code };
  };
  const sessions = [];
  const results = {};
  try {
    // 50 real logins (password check included)
    {
      const times = [], errors = [], t0 = Date.now();
      await Promise.all(ids.slice(0, 50).map(async (userId) => {
        const s = Date.now();
        const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, password: PASSWORD }) });
        if (r.ok) times.push(Date.now() - s); else errors.push(String(r.status));
      }));
      results.logins = report('Logins (50 at once)', times, errors, Date.now() - t0);
    }

    // Spread: N check-ins evenly over SECONDS
    {
      const s = await open(); sessions.push(s.id);
      const times = [], errors = [], t0 = Date.now(), gap = (SECONDS * 1000) / N;
      await Promise.all(tokens.map((tok, i) => new Promise((done) => setTimeout(() => checkIn(tok, s.code, i)
        .then((ms) => times.push(ms)).catch((e) => errors.push(e.message)).finally(done), i * gap))));
      results.spread = report(`Spread (${N} students over ${SECONDS} s)`, times, errors, Date.now() - t0);
    }

    // Burst: N check-ins, 100 in flight at a time
    {
      const s = await open(); sessions.push(s.id);
      const times = [], errors = [], t0 = Date.now();
      let next = 0;
      const worker = async () => {
        while (next < N) {
          const i = next++;
          await checkIn(tokens[i], s.code, i).then((ms) => times.push(ms)).catch((e) => errors.push(e.message));
        }
      };
      await Promise.all(Array.from({ length: 100 }, worker));
      results.burst = report(`Burst (${N} students, 100 at the same moment)`, times, errors, Date.now() - t0);
    }
    const rows = await prisma.attendance.count({ where: { sessionId: { in: sessions } } });
    console.log(`\nAttendance rows saved: ${rows} of ${N * 2} expected`);
    results.saved = rows;
  } finally {
    console.log('\nRemoving the test data …');
    await prisma.attendance.deleteMany({ where: { sessionId: { in: sessions } } });
    await prisma.attendanceCode.deleteMany({ where: { sessionId: { in: sessions } } });
    await prisma.classSession.deleteMany({ where: { id: { in: sessions } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.enrollment.deleteMany({ where: { studentId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
  console.log('\nJSON', JSON.stringify(results));
}

main().catch((e) => { console.error(e); process.exit(1); });
