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

/** Returns the user for a request, or null. Never throws. */
async function identify(req) {
  const token = readToken(req);
  if (!token) return null;
  try {
    const { id } = verifyAuthToken(token);
    // Cached for a few seconds so every page doesn't wait for this lookup (see utils/userCache.js).
    let u = userCache.get(id);
    if (u === undefined) {
      u = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, name: true, email: true, isActive: true } });
      userCache.set(id, u);
    }
    if (!u || !u.isActive) return null;
    return { id: u.id, role: roleOut(u.role), name: u.name, email: u.email };
  } catch {
    return null;
  }
}

async function requireAuth(req, res, next) {
  const user = await identify(req);
  if (!user) return next(Unauthorized('Please log in'));
  req.user = user;
  next();
}

module.exports = { requireAuth, identify };
