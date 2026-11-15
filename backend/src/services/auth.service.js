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
  return { userId: u.id, name: u.name, email: maskEmail(u.email), role: roleOut(u.role), programme: u.programme, department: u.department };
}

/** 02250368.cst@rub.edu.bt → 02*****8.cst@rub.edu.bt (enough to recognise, not enough to copy) */
function maskEmail(email) {
  const [user, domain] = String(email || '').split('@');
  if (!domain) return null;
  const [first, ...rest] = user.split('.');
  const hidden = first.length <= 3 ? first[0] + '**' : first.slice(0, 2) + '*'.repeat(first.length - 3) + first.slice(-1);
  return [hidden, ...rest].join('.') + '@' + domain;
}

async function claimRosterAccount(rawId, password, expectedRole, passwordHash) {
  const u = await prisma.user.findUnique({ where: { id: normalizeId(rawId) } });
  if (!u) throw NotFound('This ID is not on the college roster.', 'ID_NOT_FOUND');
  if (roleOut(u.role) !== expectedRole) throw Forbidden(`This is not a ${expectedRole} ID.`, 'WRONG_ROLE');
  if (u.passwordHash) throw Conflict('This account already exists. Please log in instead.', 'ALREADY_SIGNED_UP');
  const isStudent = expectedRole === 'student';
  return prisma.user.update({
    where: { id: u.id },
    data: { passwordHash: passwordHash || (await hashPassword(password)), isActive: isStudent, status: 'active' }, // tutor: pending = inactive + status active
  });
}

async function signupStudent({ userId, password, passwordHash }) {
  if (env.emailVerify && !passwordHash) throw BadRequest('Please use the sign-up form, which emails you a code first.', 'USE_SIGNUP_FORM');
  const u = await claimRosterAccount(userId, password, 'student', passwordHash);
  return { token: signAuthToken({ id: u.id, role: 'student', tokenVersion: u.tokenVersion }), user: authUser(u) };
}

async function requestTutorAccount({ userId, password, passwordHash }) {
  if (env.emailVerify && !passwordHash) throw BadRequest('Please use the sign-up form, which emails you a code first.', 'USE_SIGNUP_FORM');
  const u = await claimRosterAccount(userId, password, 'teacher', passwordHash);
  await notifyAdmins(`${u.name} (${u.id}) requested a tutor account.`);
  return { message: 'Request submitted. An admin will approve your account.' };
}

// ── B) Open register form ─────────────────────────────────────
// With EMAIL_VERIFY=on the account is only created after the 6-digit code emailed to the college
// address is entered (pending_signups holds the details until then). Off: created straight away.
const SIGNUP_MINUTES = 15;
const SIGNUP_MAX_TRIES = 5;

async function register(body) {
  const { userId, email, password, role } = body;
  const id = normalizeId(userId);
  const existing = await prisma.user.findUnique({ where: { id } });
  if (existing && existing.passwordHash) throw Conflict('That ID already has an account. Please log in.', 'ALREADY_SIGNED_UP');
  // Someone on the roster (loaded by the admin, no password yet): the code goes to the email the college has for them
  const to = existing ? existing.email : email;
  if (!existing && (await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })))
    throw Conflict('An account with this email already exists. Use "Forgot password" if it is yours.', 'EMAIL_TAKEN');
  if (existing && roleOut(existing.role) !== (role === 'teacher' ? 'teacher' : 'student'))
    throw Forbidden(`This is not a ${role === 'teacher' ? 'tutor' : 'student'} ID.`, 'WRONG_ROLE');

  const passwordHash = await hashPassword(password);
  if (!env.emailVerify) return createAccount({ ...body, id, email: to }, passwordHash, existing);

  // Email check: keep the details, send a code. An unconfirmed sign-up never blocks the ID or the email.
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const data = {
    name: body.name, email: to, role: role === 'teacher' ? 'teacher' : 'student', programme: body.programme || null,
    department: body.department || null, year: body.year || null, passwordHash,
    codeHash: await hashPassword(code), attempts: 0, expiresAt: new Date(Date.now() + SIGNUP_MINUTES * 60_000),
  };
  await prisma.$transaction([
    prisma.pendingSignup.deleteMany({ where: { email: { equals: to, mode: 'insensitive' }, userId: { not: id } } }),
    prisma.pendingSignup.upsert({ where: { userId: id }, create: { userId: id, ...data }, update: data }),
  ]);
  await sendSignupCode({ id, name: body.name || existing?.name, email: to, code });
  return {
    verify: true, userId: id, email: maskEmail(to),
    message: `We sent a 6-digit code to ${maskEmail(to)}. Enter it to finish signing up. It expires in ${SIGNUP_MINUTES} minutes.`,
  };
}

/** Emails the sign-up code (printed in the terminal during development if email isn't set up). */
async function sendSignupCode({ id, name, email, code }) {
  const text = `Use this code to finish creating your CheckIn account. It expires in ${SIGNUP_MINUTES} minutes.\nIf you didn't sign up, you can ignore this email.`;
  if (isSmtpConfigured()) {
    try {
      await sendMail({ to: email, subject: 'Your CheckIn sign-up code', text, name, code });
    } catch (e) {
      console.warn('[mailer] sign-up email failed:', explain(e));
      if (env.isProd) throw BadRequest('We could not send the email just now. Please try again in a minute.', 'EMAIL_FAILED');
      console.log(`[sign-up] code for ${id}: ${code}  (email failed)`);
    }
  } else if (!env.isProd) {
    console.log(`[sign-up] code for ${id}: ${code}  (email not configured)`);
  }
}

/** Step 2 of the email check: the code is right → create the account from the saved details. */
async function verifySignup({ userId, code }) {
  const id = normalizeId(userId);
  const invalid = () => BadRequest('That code is wrong or has expired. Request a new one.', 'SIGNUP_CODE_INVALID');
  const p = await prisma.pendingSignup.findUnique({ where: { userId: id } });
  if (!p || p.expiresAt <= new Date() || p.attempts >= SIGNUP_MAX_TRIES) throw invalid();
  if (!(await verifyPassword(code, p.codeHash))) {
    await prisma.pendingSignup.update({ where: { userId: id }, data: { attempts: { increment: 1 } } });
    throw invalid();
  }
  const existing = await prisma.user.findUnique({ where: { id } });
  if (existing && existing.passwordHash) {
    await prisma.pendingSignup.delete({ where: { userId: id } });
    throw Conflict('That ID already has an account. Please log in.', 'ALREADY_SIGNED_UP');
  }
  const out = await createAccount({ ...p, id }, p.passwordHash, existing);
  await prisma.pendingSignup.delete({ where: { userId: id } });
  return out;
}

/** Sends a fresh code for a sign-up that is waiting (same message whether or not one exists). */
async function resendSignupCode({ userId }) {
  const id = normalizeId(userId);
  const p = await prisma.pendingSignup.findUnique({ where: { userId: id } });
  const message = 'If a sign-up is waiting for this ID, a new code has been sent.';
  if (!p) return { message };
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.pendingSignup.update({
    where: { userId: id },
    data: { codeHash: await hashPassword(code), attempts: 0, expiresAt: new Date(Date.now() + SIGNUP_MINUTES * 60_000) },
  });
  await sendSignupCode({ id, name: p.name, email: p.email, code });
  return { message };
}

/** Creates the account (or finishes a roster account) once the details are trusted. */
async function createAccount({ id, name, email, role, programme, department, year }, passwordHash, existing) {
  const isStudent = role !== 'teacher';
  if (existing) {
    if (!isStudent) return requestTutorAccount({ userId: id, passwordHash });
    const out = await signupStudent({ userId: id, passwordHash });
    if (year) await prisma.user.update({ where: { id }, data: { year } }); // the year they chose on the form
    return { ...out, message: 'Account created' };
  }
  await prisma.user.create({
    data: {
      id, name, email, passwordHash, role: roleIn(isStudent ? 'student' : 'teacher'), programme,
      department: department || departmentFromProgramme(programme), isActive: isStudent, status: 'active', year: isStudent ? year || 1 : null,
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
  // (Student and staff IDs are not secret, so saying "no account" vs "wrong password" is fine here.)
  const ok = await verifyPassword(password, u?.passwordHash || DUMMY_HASH);
  // Say exactly what is wrong, so the person knows what to do next.
  if (!u) {
    throw Unauthorized('No account found for this ID. Check the ID, or sign up if you are new. If you had an account before, it may have been removed by the admin.', 'ACCOUNT_NOT_FOUND');
  }
  if (!u.passwordHash) throw Unauthorized('This ID has not been signed up yet. Tap Sign up to create your password.', 'NOT_SIGNED_UP');
  if (!ok) throw Unauthorized('Wrong password. Try again, or use Forgot password.', 'WRONG_PASSWORD');
  if (!u.isActive) {
    if (u.role === 'tutor' && u.status === 'active') throw Forbidden('Your account is waiting for admin approval.', 'ACCOUNT_PENDING');
    throw Forbidden('This account has been deactivated. If you have returned to the college, ask the admin to activate it again.', 'ACCOUNT_NOT_ACTIVE');
  }
  return { token: signAuthToken({ id: u.id, role: roleOut(u.role), tokenVersion: u.tokenVersion }), user: authUser(u) };
}

async function getMe(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw NotFound('Account not found');
  return userOut(u);
}

/** Logging out ends every login of this account (on all devices): older tokens stop working. */
async function logout(userId) {
  if (userId) await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } }).catch(() => {});
}

async function changePassword(userId, { current, next }) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u?.passwordHash || !(await verifyPassword(current, u.passwordHash))) throw BadRequest('Current password is wrong', 'WRONG_CURRENT_PASSWORD');
  if (await verifyPassword(next, u.passwordHash)) throw BadRequest('New password must be different from the current one', 'PASSWORD_UNCHANGED');
  // +1 token version: every other device is logged out; this device gets a fresh token
  const v = await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(next), tokenVersion: { increment: 1 } } });
  await notify(u.id, 'Your CheckIn password was changed. If this wasn\'t you, reset it with "Forgot password" and contact ICT Services.', 'System', { email: 'Your CheckIn password was changed' });
  return { message: 'Password updated', token: signAuthToken({ id: v.id, role: roleOut(v.role), tokenVersion: v.tokenVersion }) };
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

  const text = `Use this code to reset your CheckIn password. It works once and expires in ${RESET_MINUTES} minutes.\nIf you didn't ask for this, you can ignore this email: your password stays the same.`;
  if (isSmtpConfigured()) {
    sendMail({ to: u.email, subject: 'Your CheckIn password reset code', text, name: u.name, code })
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
    prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password), tokenVersion: { increment: 1 } } }), // logs out every device
    prisma.passwordReset.update({ where: { id: r.id }, data: { usedAt: new Date() } }),
  ]);
  await notify(id, 'Your password was reset. If this wasn\'t you, contact ICT Services.', 'System', { email: 'Your CheckIn password was reset' });
  return { message: 'Password changed. You can log in with your new password.' };
}

module.exports = { logout, lookupId, signupStudent, requestTutorAccount, register, verifySignup, resendSignupCode, maskEmail, login, getMe, changePassword, forgotPassword, resetPassword };
