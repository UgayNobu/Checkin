const { z, month } = require('./common');

const monthQuerySchema = z.object({ month: month.default(() => new Date().toISOString().slice(0, 7)) });

module.exports = { monthQuerySchema };
