// Mounted at /api/notifications
const { Router } = require('express');
const c = require('../controllers/notifications.controller');
const { requireAuth } = require('../middleware/requireAuth');
const { validateParams, validateQuery } = require('../middleware/validate');
const v = require('../validators/notification.validators');

const router = Router();
router.use(requireAuth);

// Fixed paths first so "/:id" doesn't swallow them.
router.get('/unread-count', c.unreadCount);
router.post('/read-all', c.markAllRead);
router.get('/', validateQuery(v.listNotificationsQuerySchema), c.list);
router.put('/:id/read', validateParams(v.notificationIdParamSchema), c.markRead);
router.post('/:id/read', validateParams(v.notificationIdParamSchema), c.markRead);

module.exports = router;
