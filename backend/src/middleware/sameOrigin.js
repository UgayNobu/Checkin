// ─────────────────────────────────────────────────────────────
// Stops other websites from sending forms in a logged-in person's name (CSRF).
//
// The login cookie is SameSite=None (the frontend on Vercel and the backend on Render are
// different sites), so a browser would also attach it to a request made by any other site.
// JSON requests from other sites are already blocked by CORS, but a plain HTML form or a
// file upload (multipart) is not. So every request that changes something (POST, PUT, PATCH,
// DELETE) must come from one of our own pages: browsers always send an Origin header for those.
// Requests with no Origin (Postman, the CI smoke test, curl) are not from a browser page and
// carry no cookie from a victim, so they are allowed. In development any origin is allowed.
// ─────────────────────────────────────────────────────────────
const { env } = require('../config/env');
const { Forbidden } = require('../utils/errors');

const CHANGES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** true when this request may go ahead */
function allowed(method, origin, { isProd = env.isProd, frontendUrls = env.frontendUrls } = {}) {
  if (!CHANGES.has(method)) return true;
  if (!origin) return true;
  if (!isProd) return true;
  return frontendUrls.map((u) => u.replace(/\/$/, '')).includes(origin.replace(/\/$/, ''));
}

function sameOrigin(req, res, next) {
  if (allowed(req.method, req.headers.origin)) return next();
  return next(Forbidden('This request did not come from the CheckIn website.', 'BAD_ORIGIN'));
}

module.exports = { sameOrigin, allowed };
