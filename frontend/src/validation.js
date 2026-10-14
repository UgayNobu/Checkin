// ─────────────────────────────────────────────────────────────
// Form validation shared by sign-up, login, forgot password and
// change password. The backend checks the same rules again
// (backend/src/validators/auth.validators.js, utils/password.js).
// ─────────────────────────────────────────────────────────────

export const STUDENT_ID = /^\d{8}$/;            // e.g. 02250368
export const STAFF_ID = /^CST-[A-Z0-9]{2,6}$/i; // e.g. CST-0142
export const COLLEGE_EMAIL = /^[^\s@]+@rub\.edu\.bt$/i;
const NAME = /^[A-Za-z][A-Za-z .'-]*$/;

/** Password checklist: [label, passed] for each rule. */
export const passwordChecks = (p = '') => [
  ['8–64 characters', p.length >= 8 && p.length <= 64],
  ['An uppercase letter (A–Z)', /[A-Z]/.test(p)],
  ['A lowercase letter (a–z)', /[a-z]/.test(p)],
  ['A number (0–9)', /\d/.test(p)],
  ['A symbol, e.g. @ # ! $', /[^A-Za-z0-9\s]/.test(p)],
  ['No spaces', p.length > 0 && !/\s/.test(p)],
];
export const passwordOk = (p) => passwordChecks(p).every(([, ok]) => ok);
export const PASSWORD_HINT = 'Use 8+ characters with upper and lower case letters, a number and a symbol, for example Cst@2026.';

/** Sign-up form → { field: message } (empty object = valid). */
export function validateRegister(f, tutor) {
  const e = {};
  const name = f.name.trim(), id = f.userId.trim(), email = f.email.trim();

  if (!name) e.name = 'Enter your full name.';
  else if (name.length < 2) e.name = 'Name is too short.';
  else if (!NAME.test(name)) e.name = 'Use letters only (spaces, dots, hyphens and apostrophes are fine).';

  if (!id) e.userId = tutor ? 'Enter your staff ID.' : 'Enter your student number.';
  else if (tutor && !STAFF_ID.test(id)) e.userId = 'Staff ID looks like CST-0142.';
  else if (!tutor && !STUDENT_ID.test(id)) e.userId = 'Student number is 8 digits, e.g. 02250368.';

  if (!email) e.email = 'Enter your college email.';
  else if (!COLLEGE_EMAIL.test(email)) e.email = 'Use your college email ending in @rub.edu.bt.';

  if (!f.pick) e.pick = tutor ? 'Choose your department.' : 'Choose your programme.';

  if (!f.password) e.password = 'Choose a password.';
  else if (!passwordOk(f.password)) e.password = 'Password does not meet all the rules below.';

  if (!f.again) e.again = 'Type the password again.';
  else if (f.again !== f.password) e.again = 'Passwords do not match.';
  return e;
}

/** Login form. Only checks that both boxes are filled (old test IDs like U004 must still work). */
export function validateLogin(f) {
  const e = {};
  if (!f.userId.trim()) e.userId = 'Enter your ID.';
  if (!f.password) e.password = 'Enter your password.';
  return e;
}

/** Turns a backend message like "email: must be your college email" into { email: '...' }. */
export function fieldFromServer(message, fields) {
  const m = /^(\w+): (.+)$/.exec(message || '');
  if (m && fields.includes(m[1])) return { [m[1]]: m[2].charAt(0).toUpperCase() + m[2].slice(1) };
  return null;
}
