// ─────────────────────────────────────────────────────────────
// The current academic session (semester), e.g. AS2026.
//
// Tutor assignments (sections) and enrolments belong to a semester
// (database.sql Part 9). Everything "live" — My Modules, enrolment,
// check-in, the timetable, dashboards — uses the CURRENT semester, so a
// new semester starts clean. Past semesters stay in the database and can
// still be viewed by passing ?session=AS2026 to the report routes.
//
// Kept in memory for 30 seconds so pages don't wait for this lookup.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('./prisma');
const { BadRequest } = require('../utils/errors');

const TTL_MS = 30 * 1000;
let cached = null;
let cachedAt = 0;

/** Code of the current semester, e.g. 'AS2026'. */
async function currentAcademicSession() {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;
  const row = await prisma.academicSession.findFirst({ where: { isCurrent: true }, select: { code: true } });
  if (!row) throw new Error('No current academic session. Run database.sql (Part 9) in Supabase.');
  cached = row.code;
  cachedAt = Date.now();
  return cached;
}

const CODE = /^(AS|SS)\d{4}$/;

/** The semester asked for (?session=AS2026), or the current one. */
async function sessionOrCurrent(code) {
  if (!code) return currentAcademicSession();
  const c = String(code).trim().toUpperCase();
  if (!CODE.test(c)) throw BadRequest('Semester must look like AS2026 or SS2027', 'BAD_SESSION');
  return c;
}

/** Call after the admin changes the current semester. */
function clearAcademicSessionCache() {
  cached = null;
}

module.exports = { currentAcademicSession, sessionOrCurrent, clearAcademicSessionCache };
