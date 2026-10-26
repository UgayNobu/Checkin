// ─────────────────────────────────────────────────────────────
// Notifications go to three places:
//  1. In the app (the bell / notification list) — always.
//  2. Email — to the email the person gave when they signed up
//     (or the admin entered), unless they turned email off in Settings.
//     Needs SMTP in .env; skipped silently when it isn't set up.
//  3. SMS — to the phone number in their profile, only if they turned
//     SMS on in Settings. Needs SMS in .env (src/lib/sms.js).
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { sendMailInBackground } = require('../lib/mailer');
const { sendSmsInBackground } = require('../lib/sms');
const { NotFound } = require('../utils/errors');

/**
 * notify(userId, message, category, { email: 'Subject line' | false, sms: false | 'always' })
 * Every notification is emailed by default (subject "CheckIn – <category>" unless one is given).
 * SMS goes out when the person turned SMS on; { sms: 'always' } texts any phone on file
 * (used for security messages such as a password change). { email: false } / { sms: false } = app only.
 * Never throws — a failed notification must not break the main action.
 */
async function notify(userId, message, category, options = {}) {
  try {
    await prisma.notification.create({ data: { userId, message, category } });
    if (options.email === false && options.sms === false) return;
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, phone: true, prefs: true } });
    const prefs = u?.prefs || {};
    if (options.email !== false && u?.email && prefs.email !== false) {
      const subject = typeof options.email === 'string' ? options.email : `CheckIn – ${category || 'Notification'}`;
      sendMailInBackground({ to: u.email, subject, text: message });
    }
    if (u?.phone && (options.sms === 'always' || (options.sms !== false && prefs.sms === true))) sendSmsInBackground({ to: u.phone, text: message });
  } catch (e) {
    console.warn('[notify] failed:', e.message);
  }
}

/** Notify every active admin (e.g. a tutor asked for an account). */
async function notifyAdmins(message, category = 'System') {
  const admins = await prisma.user.findMany({ where: { role: 'admin', isActive: true }, select: { id: true } });
  await Promise.all(admins.map((a) => notify(a.id, message, category)));
}

const list = (userId, { limit = 50, unread } = {}) => prisma.notification.findMany({
  where: { userId, ...(unread === 'true' && { isRead: false }) }, orderBy: { createdAt: 'desc' }, take: limit,
});

const unreadCount = async (userId) => ({ count: await prisma.notification.count({ where: { userId, isRead: false } }) });

async function markRead(userId, id) {
  // updateMany with userId → you can only mark your own notifications.
  const r = await prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
  if (!r.count) throw NotFound('Notification not found');
  return { ok: true };
}

const markAllRead = async (userId) => ({
  updated: (await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } })).count,
});

module.exports = { notify, notifyAdmins, list, unreadCount, markRead, markAllRead };
