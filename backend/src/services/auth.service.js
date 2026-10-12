// ─────────────────────────────────────────────────────────────
// Sign-up, login, current user and password change.
//
// Two ways to get an account:
//  A) Roster sign-up (design doc): an admin pre-loads users
//     (scripts/import-roster.js) with no password. The person types
//     their ID → we show their name/email → they set a password.
//  B) Open register form (existing frontend): the person fills in
//     everything. Students are active straight away; tutors wait for
//     an admin to approve them.
// Tutor accounts are never active until an admin approves them.
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { hashPassword, verifyPassword, DUMMY_HASH } = require('../utils/password');
const { signAuthToken } = require('../utils/jwt');
const { normalizeId } = require('../utils/id-format');
const { roleIn, roleOut, userOut } = require('../utils/format');
const { BadRequest, Unauthorized, Forbidden, NotFound, Conflict } = require('../utils/errors');
const { notifyAdmins } = require('./notifications.service');

const authUser = (u) => ({ name: u.name, userId: u.id, role: roleOut(u.role) });
const departmentFromProgramme = (p) => (p || '').replace(/^(BE|B\.E\.)\s+/i, '') || null;

// ── A) Roster sign-up ─────────────────────────────────────────
async function lookupId(rawId) {
  const u = await prisma.user.findUnique({ where: { id: normalizeId(rawId) } });
  if (!u) throw NotFound('This ID is not on the college roster. Contact ICT Services, or use the full sign-up form.', 'ID_NOT_FOUND');
  if (u.passwordHash) throw Conflict('This account already exists. Please log in instead.', 'ALREADY_SIGNED_UP');
  if (u.status === 'inactive') throw Forbidden('This account is not active. Contact ICT Services.', 'ACCOUNT_INACTIVE');
  return { userId: u.id, name: u.name, email: u.email, role: roleOut(u.role), programme: u.programme, department: u.department };
}

async function claimRosterAccount(rawId, password, expectedRole) {
  const u = await prisma.user.findUnique({ where: { id: normalizeId(rawId) } });
  if (!u) throw NotFound('This ID is not on the college roster.', 'ID_NOT_FOUND');
  if (roleOut(u.role) !== expectedRole) throw Forbidden(`This is not a ${expectedRole} ID.`, 'WRONG_ROLE');
  if (u.passwordHash) throw Conflict('This account already exists. Please log in instead.', 'ALREADY_SIGNED_UP');
  const isStudent = expectedRole === 'student';
  return prisma.user.update({
    where: { id: u.id },
    data: { passwordHash: await hashPassword(password), isActive: isStudent, status: 'active' }, // tutor: pending = inactive + status active
  });
}

async function signupStudent({ userId, password }) {
  const u = await claimRosterAccount(userId, password, 'student');
  return { token: signAuthToken({ id: u.id, role: 'student' }), user: authUser(u) };
}

async function requestTutorAccount({ userId, password }) {
  const u = await claimRosterAccount(userId, password, 'teacher');
  await notifyAdmins(`${u.name} (${u.id}) requested a tutor account.`);
  return { message: 'Request submitted. An admin will approve your account.' };
}

// ── B) Open register form ─────────────────────────────────────
async function register({ userId, name, email, password, role, programme, department }) {
  const id = normalizeId(userId);
  const existing = await prisma.user.findUnique({ where: { id } });
  // Someone on the roster who hasn't signed up yet → use the roster flow instead of failing.
  if (existing && !existing.passwordHash) {
    return role === 'teacher' ? requestTutorAccount({ userId: id, password }) : { ...(await signupStudent({ userId: id, password })), message: 'Account created' };
  }
  if (existing) throw Conflict('That ID already has an account. Please log in.', 'ALREADY_SIGNED_UP');

  const isStudent = role === 'student';
  await prisma.user.create({
    data: {
      id, name, email, passwordHash: await hashPassword(password), role: roleIn(role), programme,
      department: department || departmentFromProgramme(programme), isActive: isStudent, status: 'active', year: isStudent ? 1 : null,
    },
  });
  if (!isStudent) {
    await notifyAdmins(`${name} (${id}) requested a tutor account.`);
    return { message: 'Request submitted. An admin will approve your account.' };
  }
  return { message: 'Account created' };
}

// ── Login ─────────────────────────────────────────────────────
async function login({ userId, password }) {
  const u = await prisma.user.findUnique({ where: { id: normalizeId(userId) } });
  // Always run bcrypt, so "no such user" takes as long as "wrong password".
  const ok = await verifyPassword(password, u?.passwordHash || DUMMY_HASH);
  if (!u || !u.passwordHash || !ok) throw Unauthorized('Wrong ID or password', 'INVALID_CREDENTIALS');
  if (!u.isActive) {
    if (u.role === 'tutor' && u.status === 'active') throw Forbidden('Your account is waiting for admin approval.', 'ACCOUNT_PENDING');
    throw Forbidden('Account is not active. Contact ICT Services.', 'ACCOUNT_NOT_ACTIVE');
  }
  return { token: signAuthToken({ id: u.id, role: roleOut(u.role) }), user: authUser(u) };
}

async function getMe(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw NotFound('Account not found');
  return userOut(u);
}

async function changePassword(userId, { current, next }) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u?.passwordHash || !(await verifyPassword(current, u.passwordHash))) throw BadRequest('Current password is wrong', 'WRONG_CURRENT_PASSWORD');
  if (await verifyPassword(next, u.passwordHash)) throw BadRequest('New password must be different from the current one', 'PASSWORD_UNCHANGED');
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(next) } });
  return { message: 'Password updated' };
}

module.exports = { lookupId, signupStudent, requestTutorAccount, register, login, getMe, changePassword };
