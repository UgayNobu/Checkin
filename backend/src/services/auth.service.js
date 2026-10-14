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
const { notifyAdmins, notify } = require('./notifications.service');
const crypto = require('crypto');
const { env } = require('../config/env');
const { sendMail, isSmtpConfigured, explain } = require('../lib/mailer');

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
  if (await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } }))
    throw Conflict('An account with this email already exists. Use "Forgot password" if it is yours.', 'EMAIL_TAKEN');
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

// ── Forgot password (6-digit code by email) ───────────────────
const RESET_MINUTES = 15;
const RESET_MAX_TRIES = 5;
const SENT = 'If that ID has an account, a 6-digit code has been sent to its email. It expires in 15 minutes.';

/**
 * Step 1: make a new code and email it. The answer is the same whether or not the ID
 * exists, so nobody can use this page to find out which IDs have accounts.
 */
async function forgotPassword({ userId }) {
  const u = await prisma.user.findUnique({ where: { id: normalizeId(userId) } });
  const result = { message: SENT };
  if (!u || !u.passwordHash || !u.email || u.status === 'inactive') return result;

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const now = new Date();
  await prisma.$transaction([
    // Only the newest code works
    prisma.passwordReset.updateMany({ where: { userId: u.id, usedAt: null }, data: { usedAt: now } }),
    prisma.passwordReset.create({ data: { userId: u.id, codeHash: await hashPassword(code), expiresAt: new Date(now.getTime() + RESET_MINUTES * 60_000) } }),
  ]);

  const text = `Hello ${u.name || ''},\n\nYour CheckIn password reset code is ${code}.\nIt expires in ${RESET_MINUTES} minutes. If you didn't ask for this, you can ignore this email.`;
  if (isSmtpConfigured()) {
    sendMail({ to: u.email, subject: 'Your CheckIn password reset code', text })
      .then(() => console.log(`[forgot-password] code emailed to ${u.id}`))
      .catch((e) => {
        console.warn('[mailer] reset email failed:', explain(e));
        // During development, still show the code so testing isn't blocked by email problems
        if (!env.isProd) console.log(`[forgot-password] code for ${u.id}: ${code}  (email failed)`);
      });
  } else if (!env.isProd) {
    // Email isn't set up yet (no SMTP_HOST in .env): print the code so it can still be tested
    console.log(`[forgot-password] code for ${u.id}: ${code}  (email not configured)`);
    result.devNote = 'Email is not set up on this server yet, so the code is printed in the backend terminal.';
  }
  return result;
}

/** Step 2: check the code and set the new password. */
async function resetPassword({ userId, code, password }) {
  const id = normalizeId(userId);
  const invalid = () => BadRequest('That code is wrong or has expired. Request a new one.', 'RESET_CODE_INVALID');
  const r = await prisma.passwordReset.findFirst({ where: { userId: id, usedAt: null }, orderBy: { createdAt: 'desc' } });
  if (!r || r.expiresAt <= new Date() || r.attempts >= RESET_MAX_TRIES) throw invalid();

  if (!(await verifyPassword(code, r.codeHash))) {
    await prisma.passwordReset.update({ where: { id: r.id }, data: { attempts: { increment: 1 } } });
    throw invalid();
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } }),
    prisma.passwordReset.update({ where: { id: r.id }, data: { usedAt: new Date() } }),
  ]);
  await notify(id, 'Your password was reset. If this wasn\'t you, contact ICT Services.', 'System');
  return { message: 'Password changed. You can log in with your new password.' };
}

module.exports = { lookupId, signupStudent, requestTutorAccount, register, login, getMe, changePassword, forgotPassword, resetPassword };
