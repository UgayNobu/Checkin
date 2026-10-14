// ─────────────────────────────────────────────────────────────
// In-app notifications (+ optional email when SMTP is set up and
// the user hasn't turned email off in their settings).
// ─────────────────────────────────────────────────────────────
const { prisma } = require('../lib/prisma');
const { sendMailInBackground } = require('../lib/mailer');
const { NotFound } = require('../utils/errors');

/**
 * notify(userId, message, category, { email: 'Subject line' })
 * Never throws — a failed notification must not break the main action.
 */
async function notify(userId, message, category, options = {}) {
  try {
    await prisma.notification.create({ data: { userId, message, category } });
    if (options.email) {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, prefs: true } });
      if (u?.email && u.prefs?.email !== false) sendMailInBackground({ to: u.email, subject: options.email, text: message });
    }
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
