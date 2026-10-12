const { z, id, isoDate, optionalText } = require('./common');

// multipart/form-data fields arrive as strings
const submitReliefSchema = z.object({
  module: id,
  date: isoDate,
  type: z.enum(['medical', 'official']).default('medical'),
  reason: optionalText(500),
});
const reliefIdParamSchema = z.object({ id });
const reviewReliefSchema = z.object({ status: z.enum(['approved', 'rejected']), note: optionalText(200) });
const listReliefQuerySchema = z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() });

module.exports = { submitReliefSchema, reliefIdParamSchema, reviewReliefSchema, listReliefQuerySchema };
