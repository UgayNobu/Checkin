const { z, id } = require('./common');

const notificationIdParamSchema = z.object({ id });
const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  unread: z.enum(['true', 'false']).optional(),
});

module.exports = { notificationIdParamSchema, listNotificationsQuerySchema };
