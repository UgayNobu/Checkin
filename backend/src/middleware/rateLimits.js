const { rateLimit } = require('express-rate-limit');

const base = { standardHeaders: 'draft-7', legacyHeaders: false };

/** Whole API: 300 requests per minute per IP. */
const apiLimiter = rateLimit({ ...base, windowMs: 60_000, limit: 300 });

/** Login / sign-up: 15 failed tries per minute (successful logins don't count). */
const authLimiter = rateLimit({
  ...base, windowMs: 60_000, limit: 15, skipSuccessfulRequests: true,
  message: { error: 'Too many attempts. Please wait a minute and try again.', code: 'RATE_LIMITED' },
});

/** ID lookup: stops someone scanning every student number. */
const lookupLimiter = rateLimit({
  ...base, windowMs: 60_000, limit: 10,
  message: { error: 'Too many ID lookups. Please wait a moment.', code: 'RATE_LIMITED' },
});

/** Check-in: stops guessing codes. */
const checkinLimiter = rateLimit({
  ...base, windowMs: 60_000, limit: 20,
  message: { error: 'Too many check-in attempts. Please wait a minute.', code: 'RATE_LIMITED' },
});

module.exports = { apiLimiter, authLimiter, lookupLimiter, checkinLimiter };
