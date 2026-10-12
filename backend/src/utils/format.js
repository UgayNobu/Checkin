// ─────────────────────────────────────────────────────────────
// Small converters between database rows and API responses.
// ─────────────────────────────────────────────────────────────
const { ATTENDED, FLAGGED } = require('../config/constants');

// The DB says 'tutor'; the API and frontend say 'teacher'.
const roleOut = (r) => (r === 'tutor' ? 'teacher' : r);
const roleIn = (r) => (r === 'teacher' ? 'tutor' : r);
const cap = (x) => (x ? x[0].toUpperCase() + x.slice(1).toLowerCase() : x);

/** DB status → one of present / flagged / absent. */
const apiStatus = (s) => (ATTENDED.includes(s) ? 'present' : FLAGGED.includes(s) ? 'flagged' : 'absent');

/** A session stores date and start_time separately; join them into one instant. */
const sessionStart = (x) => new Date(x.date.toISOString().slice(0, 10) + 'T' + x.startTime.toISOString().slice(11, 19) + 'Z');

const round1 = (n) => Math.round(n * 10) / 10;
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };
const initials = (name = '') => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

const DEFAULT_PREFS = { low: true, relief: true, reminders: false, email: true, sms: false, push: true };

/** Public shape of a user. Never includes the password hash. */
const userOut = (u) => ({
  _id: u.id, userId: u.id, name: u.name, email: u.email, phone: u.phone,
  department: u.department, designation: u.designation, programme: u.programme, year: u.year,
  role: roleOut(u.role), active: u.isActive, status: u.status, createdAt: u.createdAt,
  avatarUrl: u.avatarUrl || null, prefs: { ...DEFAULT_PREFS, ...(u.prefs || {}) },
});

module.exports = { roleOut, roleIn, cap, apiStatus, sessionStart, round1, monthStart, initials, userOut, DEFAULT_PREFS };
