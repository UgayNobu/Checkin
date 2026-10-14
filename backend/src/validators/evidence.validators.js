const { z, id, isoDate, optionalText } = require('./common');

// multipart/form-data fields arrive as strings
// No module: the request is attached to every module the student is enrolled in.
const submitEvidenceSchema = z.object({
  date: isoDate,
  type: z.enum(['medical', 'official']).default('medical'),
  reason: optionalText(500),
});

const evidenceIdParamSchema = z.object({ id });

const reviewEvidenceSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  note: optionalText(200),
});

const listEvidenceQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

module.exports = {
  submitEvidenceSchema,
  evidenceIdParamSchema,
  reviewEvidenceSchema,
  listEvidenceQuerySchema,
};