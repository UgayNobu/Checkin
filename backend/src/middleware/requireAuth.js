// ─────────────────────────────────────────────────────────────
// Reads the JWT from the Authorization header ("Bearer <token>") or the
// httpOnly cookie, checks it, then loads the user so a deactivated
// account loses access immediately (not just when the token expires).
// Sets req.user = { id, role, name }.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { verifyAuthToken } = require('../utils/jwt');
const { COOKIE_NAME } = require('../utils/cookies');
const { roleOut } = require('../utils/format');
const { Unauthorized } = require('../utils/errors');
const userCache = require('../utils/userCache');

function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ') && header.length > 7) return header.slice(7);
  return req.cookies?.[COOKIE_NAME] || null;
}

// What the person is told when their saved login stops working because of the admin
const GONE = {
  removed: ['Your account is no longer available. It may have been removed by the admin. Contact ICT Services if this is a mistake.', 'ACCOUNT_REMOVED'],
  inactive: ['Your account has been deactivated by the admin, so you have been logged out. Contact ICT Services if this is a mistake.', 'ACCOUNT_NOT_ACTIVE'],
  ended: ['You have been logged out, because you logged out or changed your password on another device. Please log in again.', 'SESSION_ENDED'],
};

/**
 * Who is making this request. Never throws.
 * @returns {{ user } | { gone: 'removed' | 'inactive' | 'ended' } | {}}
 *   user = logged in and active; gone = the token is valid but the account was removed or
 *   deactivated since; {} = no token or a bad / expired one.
 */
async function check(req) {
  const token = readToken(req);
  if (!token) return {};
  try {
    const { id, tv } = verifyAuthToken(token);
    // Cached for a few seconds so every page doesn't wait for this lookup (see utils/userCache.js).
    let u = userCache.get(id);
    if (u === undefined) {
      u = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, name: true, email: true, isActive: true, tokenVersion: true } });
      userCache.set(id, u);
    }
    if (!u) return { gone: 'removed' };
    if (!u.isActive) return { gone: 'inactive' };
    // Logged out / password changed since this token was made (tokens from before this check have no tv = 0)
    if ((tv ?? 0) !== (u.tokenVersion ?? 0)) return { gone: 'ended' };
    return { user: { id: u.id, role: roleOut(u.role), name: u.name, email: u.email } };
  } catch {
    return {};
  }
}

/** Returns the user for a request, or null. Never throws. */
async function identify(req) {
  return (await check(req)).user || null;
}

async function requireAuth(req, res, next) {
  const { user, gone } = await check(req);
  if (gone) return next(Unauthorized(...GONE[gone]));
  if (!user) return next(Unauthorized('Please log in'));
  req.user = user;
  next();
}

module.exports = { requireAuth, identify };
