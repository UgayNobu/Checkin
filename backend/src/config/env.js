// ─────────────────────────────────────────────────────────────
// Reads .env once and exposes typed settings to the rest of the app.
// Every other file imports from here instead of touching process.env.
// ─────────────────────────────────────────────────────────────
require('dotenv').config();

const num = (value, fallback) => (value === undefined || value === '' || Number.isNaN(+value) ? fallback : +value);
const list = (value, fallback) => (value ? value.split(',').map((x) => x.trim()).filter(Boolean) : fallback);

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: num(process.env.PORT, 5000),
  frontendUrls: list(process.env.FRONTEND_URL, ['http://localhost:3000', 'http://localhost:5173']),

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',

  geofenceMetres: num(process.env.GEOFENCE_METRES, 10),
  accuracyFlagMetres: num(process.env.ACCURACY_FLAG_METRES, 50),
  codeValidityMinutes: num(process.env.CODE_VALIDITY_MINUTES, 10),
  requiredPct: num(process.env.REQUIRED_ATTENDANCE_PERCENT, 90),
  atRiskPct: num(process.env.AT_RISK_ATTENDANCE_PERCENT, 80),
  realertDays: num(process.env.LOW_ATTENDANCE_REALERT_DAYS, 7),

  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    bucket: process.env.SUPABASE_BUCKET || 'checkin-files',
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: num(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'CheckIn <no-reply@cst.edu.bt>',
  },
};

if (!env.jwtSecret) {
  if (env.isProd) throw new Error('JWT_SECRET must be set in production');
  console.warn('[env] JWT_SECRET is not set — using an insecure development secret.');
  env.jwtSecret = 'dev-only-insecure-secret';
}

module.exports = { env };
