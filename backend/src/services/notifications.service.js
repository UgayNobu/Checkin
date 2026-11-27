// ─────────────────────────────────────────────────────────────
// In-app notifications (+ optional email when SMTP is set up and
// the user hasn't turned email off in their settings).
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { sendMailInBackground } = require('../lib/mailer');
const { NotFound } = require('../utils/errors');
const { env } = require('../config/env');

/**
 * notify(userId, message, category, { email: 'Subject line' })
 * Never throws — a failed notification must not break the main action.
 */
async function notify(userId, message, category, options = {}) {
  try {
    await prisma.notification.create({ data: { userId, message, category } });
    if (options.email) {
      // Only active accounts get emails. A deactivated or rejected user still gets the in-app notification
      // (they see it if the account is turned back on); a deleted user gets nothing.
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, prefs: true, name: true, isActive: true, status: true } });
      if (u?.email && u.isActive && u.status !== 'inactive' && u.prefs?.email !== false) {
        sendMailInBackground({ to: u.email, subject: options.email, text: message, name: u.name });
      }
    }
  } catch (e) {
    console.warn('[notify] failed:', e.message);
  }
}

/** Notify every active user of one role (bell always; email as in notify()). */
async function notifyRole(role, message, category = 'System', options = {}) {
  try {
    const users = await prisma.user.findMany({ where: { role, isActive: true }, select: { id: true } });
    await Promise.all(users.map((u) => notify(u.id, message, category, options)));
  } catch (e) {
    console.warn('[notifyRole] failed:', e.message);
  }
}

/** Notify every active admin (e.g. a tutor asked for an account), by email too if they set a real one. */
const notifyAdmins = (message, category = 'System') => notifyRole('admin', message, category, { email: 'New tutor account request' });

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

/**
 * Old notifications expire (run once a day): read ones after notifyKeepReadDays (30),
 * unread ones after notifyKeepDays (90), so a student who rarely opens the app still sees
 * important notices for about a semester. Only bell messages are removed, never records.
 */
async function pruneOld(now = new Date()) {
  const day = 24 * 60 * 60 * 1000;
  const r = await prisma.notification.deleteMany({
    where: {
      OR: [
        { isRead: true, createdAt: { lt: new Date(now.getTime() - env.notifyKeepReadDays * day) } },
        { createdAt: { lt: new Date(now.getTime() - env.notifyKeepDays * day) } },
      ],
    },
  });
  return r.count;
}

module.exports = { notify, notifyRole, pruneOld, notifyAdmins, list, unreadCount, markRead, markAllRead };
