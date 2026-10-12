// ─────────────────────────────────────────────────────────────
// Tiny in-memory cache for the logged-in user check.
// Every API request needs "who is this, and are they still active?".
// Asking the database each time adds one full round trip to every
// page, so the answer is kept for a few seconds. Any change to the
// users table (deactivate, approve, rename…) clears the cache at once
// (see lib/prisma.js), so access is still removed immediately.
// ─────────────────────────────────────────────────────────────
const TTL_MS = 15 * 1000;
const cache = new Map(); // userId → { user, until }

function get(id) {
  const hit = cache.get(id);
  if (!hit) return undefined;
  if (hit.until < Date.now()) { cache.delete(id); return undefined; }
  return hit.user;
}

function set(id, user) {
  if (cache.size > 5000) cache.clear(); // keep memory small
  cache.set(id, { user, until: Date.now() + TTL_MS });
}

const clear = () => cache.clear();

module.exports = { get, set, clear, TTL_MS };
