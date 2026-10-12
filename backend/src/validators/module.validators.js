const { z, id } = require('./common');
const { validateEnrolmentKey } = require('../utils/enrolment-key');

const moduleIdParamSchema = z.object({ id });
// key: '' removes the key. selfEnrol: open or close self-enrolment. At least one is needed.
const enrolmentKeyBodySchema = z.object({
  key: z.string().trim().superRefine((k, ctx) => { const m = k && validateEnrolmentKey(k); if (m) ctx.addIssue({ code: 'custom', message: m }); }).optional(),
  selfEnrol: z.boolean().optional(),
}).refine((b) => b.key !== undefined || b.selfEnrol !== undefined, { message: 'Send a key or selfEnrol', path: ['key'] });
const addStudentBodySchema = z.object({ userId: id });
// VLE-style: the student picks a module, then types that module's key. { key } alone still works.
const enrolBodySchema = z.object({ module: id.optional(), key: z.string().trim().min(1, 'Please enter the enrolment key') });

module.exports = { moduleIdParamSchema, enrolmentKeyBodySchema, addStudentBodySchema, enrolBodySchema };
