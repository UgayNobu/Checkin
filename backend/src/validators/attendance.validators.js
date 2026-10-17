const { z, month } = require('./common');

const monthQuerySchema = z.object({ month: month.default(() => new Date().toISOString().slice(0, 7)) });

const dayQuerySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date like 2026-10-12') });

module.exports = { monthQuerySchema, dayQuerySchema };
