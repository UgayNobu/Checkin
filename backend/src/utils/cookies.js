// httpOnly cookie that carries the JWT, so the browser sends it automatically
// and page scripts can't read it. The Bearer header still works too.
const { env } = require('../config/env');

const COOKIE_NAME = 'checkin_token';
const options = () => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.isProd ? 'none' : 'lax', // frontend (Vercel) and backend (Render) are different sites in production
  maxAge: 8 * 60 * 60 * 1000,
  path: '/',
});

const setAuthCookie = (res, token) => res.cookie(COOKIE_NAME, token, options());
const clearAuthCookie = (res) => res.clearCookie(COOKIE_NAME, { ...options(), maxAge: undefined });

module.exports = { COOKIE_NAME, setAuthCookie, clearAuthCookie };
