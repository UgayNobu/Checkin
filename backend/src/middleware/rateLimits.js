// ─────────────────────────────────────────────────────────────
// Rate limits.
//
// On campus Wi-Fi every student shares ONE public IP address, so limits are
// counted per logged-in USER wherever possible. Counting per IP would let the
// first few students of a class use up the limit and block everyone else
// (e.g. 60 students checking in within the same 2 minutes).
//  • logged in        → counted per user
//  • login / sign-up  → per IP + the ID being tried (one person's typos don't block the class)
//  • anonymous        → per IP
// ─────────────────────────────────────────────────────────────
const { rateLimit } = require('express-rate-limit');
const { verifyAuthToken } = require('../utils/jwt');
const { COOKIE_NAME } = require('../utils/cookies');

const base = { standardHeaders: 'draft-7', legacyHeaders: false };

/** The logged-in user's id from the JWT (no database lookup), or null. */
function userIdOf(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') && header.length > 7 ? header.slice(7) : req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    return verifyAuthToken(token).id || null;
  } catch {
    return null;
  }
}
const byUserOrIp = (req) => {
  const id = userIdOf(req);
  return id ? `u:${id}` : `ip:${req.ip}`;
};
const byIpAndId = (req) => `ip:${req.ip}|id:${String(req.body?.userId || req.query?.id || '').trim().toUpperCase()}`;

/** Whole API: 300 requests per minute per user (per IP when not logged in). */
const apiLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 300, keyGenerator: byUserOrIp });

/** Login / sign-up: 15 failed tries per minute for the same ID from the same place (successful logins don't count). */
const authLimiter = rateLimit({
  ...base, windowMs: 60_000, limit: 15, skipSuccessfulRequests: true, keyGenerator: byIpAndId,
  message: { error: 'Too many attempts. Please wait a minute and try again.', code: 'RATE_LIMITED' },
});

/** ID lookup: stops someone scanning every student number (a whole class signing up still fits). */
const lookupLimiter = rateLimit({
  ...base, windowMs: 60_000, limit: 60,
  message: { error: 'Too many ID lookups. Please wait a moment.', code: 'RATE_LIMITED' },
});

/** Check-in: 10 tries per minute per student, so nobody can guess codes but a whole class can check in at once. */
const checkinLimiter = rateLimit({
  ...base, windowMs: 60_000, limit: 10, keyGenerator: byUserOrIp,
  message: { error: 'Too many check-in attempts. Please wait a minute.', code: 'RATE_LIMITED' },
});

/** Forgot password: 10 per 15 minutes for the same ID from the same place (stops flooding an inbox and guessing codes). */
const resetLimiter = rateLimit({
  ...base, windowMs: 15 * 60_000, limit: 10, keyGenerator: byIpAndId,
  message: { error: 'Too many password reset attempts. Please wait 15 minutes.', code: 'RATE_LIMITED' },
});

module.exports = { apiLimiter, authLimiter, lookupLimiter, checkinLimiter, resetLimiter };
