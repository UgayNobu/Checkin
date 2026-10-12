const { asyncHandler } = require('../utils/errors');
const n = require('../services/notifications.service');

module.exports = {
  list: asyncHandler(async (req, res) => res.json(await n.list(req.user.id, req.query))),
  unreadCount: asyncHandler(async (req, res) => res.json(await n.unreadCount(req.user.id))),
  markRead: asyncHandler(async (req, res) => res.json(await n.markRead(req.user.id, req.params.id))),
  markAllRead: asyncHandler(async (req, res) => res.json(await n.markAllRead(req.user.id))),
};
