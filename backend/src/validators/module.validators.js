const { z, id } = require('./common');
const { validateEnrolmentKey } = require('../utils/enrolment-key');

const moduleIdParamSchema = z.object({ id });
const enrolmentKeyBodySchema = z.object({
  key: z.string().trim().superRefine((k, ctx) => { const m = validateEnrolmentKey(k); if (m) ctx.addIssue({ code: 'custom', message: m }); }),
});
const addStudentBodySchema = z.object({ userId: id });
const enrolBodySchema = z.object({ key: z.string().trim().min(1, 'Enter the enrolment key') });

module.exports = { moduleIdParamSchema, enrolmentKeyBodySchema, addStudentBodySchema, enrolBodySchema };
