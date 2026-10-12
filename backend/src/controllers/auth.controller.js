// Controllers only translate HTTP ⇄ service calls. All logic lives in services/.
const { asyncHandler } = require('../utils/errors');
const { setAuthCookie, clearAuthCookie } = require('../utils/cookies');
const { identify } = require('../middleware/requireAuth');
const auth = require('../services/auth.service');

// Login also sets the httpOnly cookie; the token is still returned for the Bearer header.
const withSession = (res, result) => { if (result.token) setAuthCookie(res, result.token); res.json(result); };

module.exports = {
  register: asyncHandler(async (req, res) => withSession(res, await auth.register(req.body))),
  login: asyncHandler(async (req, res) => withSession(res, await auth.login(req.body))),
  logout: (req, res) => { clearAuthCookie(res); res.json({ ok: true }); },
  // Design doc: /api/auth/me answers 200 with null when not logged in (never 401) — handy on page load.
  me: asyncHandler(async (req, res) => { const u = await identify(req); res.json(u ? await auth.getMe(u.id) : null); }),
  lookupId: asyncHandler(async (req, res) => res.json(await auth.lookupId(req.query.id))),
  studentSignup: asyncHandler(async (req, res) => withSession(res, await auth.signupStudent(req.body))),
  tutorRequest: asyncHandler(async (req, res) => res.json(await auth.requestTutorAccount(req.body))),
  changePassword: asyncHandler(async (req, res) => res.json(await auth.changePassword(req.user.id, req.body))),
};
