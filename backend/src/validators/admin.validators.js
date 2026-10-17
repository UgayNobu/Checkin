const { z, id, optionalText, optionalNumber, isoDate } = require('./common');

const programNameSchema = z.object({ name: z.string().trim().min(2).max(100) });
const programRenameSchema = z.object({ from: z.string().trim().min(1), to: z.string().trim().min(2).max(100) });
const programParamSchema = z.object({ name: z.string().trim().min(1) });

const usersQuerySchema = z.object({
  role: z.enum(['student', 'teacher', 'admin', 'management']).default('student'),
  department: optionalText(100),
  programme: optionalText(100), // programme pages: matches users.programme (or an older department text)
  year: optionalNumber(z.number().int().min(1).max(6)),
});
const userIdParamSchema = z.object({ id });
// Deactivating needs a reason; the allowed reasons depend on the role (checked in admin.service).
const DEACTIVATION_REASONS = ['graduated', 'dropped_out', 'transferred', 'on_leave', 'resigned', 'retired', 'other'];
const userPatchSchema = z.object({
  active: z.boolean().optional(),
  name: z.string().trim().min(2).max(100).optional(),
  reason: z.enum(DEACTIVATION_REASONS).optional(),
  note: optionalText(200),
}).refine((b) => b.active !== false || b.reason, { message: 'Choose why this account is being deactivated', path: ['reason'] })
  .refine((b) => b.reason !== 'other' || b.note, { message: 'Write a short note when the reason is "Other"', path: ['note'] });

const modulesQuerySchema = z.object({
  department: optionalText(100),
  year: optionalNumber(z.number().int().min(1).max(6)),
  semester: optionalNumber(z.number().int().min(1).max(2)),
});
const moduleBodySchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().min(2).max(20).transform((c) => c.toUpperCase()),
  department: z.string().trim().min(2).max(100),
  year: optionalNumber(z.number().int().min(1).max(6)),
  semester: optionalNumber(z.number().int().min(1).max(2)),
  count: optionalNumber(z.number().int().min(0).max(1000)),
  tutorId: optionalText(40),
});
const moduleIdParamSchema = z.object({ id });

const atRiskQuerySchema = z.object({
  below: optionalNumber(z.number().min(1).max(100)),
  department: optionalText(100),
});
const auditQuerySchema = z.object({
  action: optionalText(100), q: optionalText(100),
  from: optionalText(10), to: optionalText(10),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

module.exports = {
  programNameSchema, programRenameSchema, programParamSchema, usersQuerySchema, userIdParamSchema, userPatchSchema,
  modulesQuerySchema, moduleBodySchema, moduleIdParamSchema, atRiskQuerySchema, auditQuerySchema,
};

// ── Semesters (AS = Autumn, SS = Spring)
const semesterParamSchema = z.object({ code: z.string().trim().toUpperCase().regex(/^(AS|SS)\d{4}$/, 'must look like AS2027') });
const semesterBodySchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^(AS|SS)\d{4}$/, 'must look like AS2027 (Autumn) or SS2027 (Spring)'),
  name: optionalText(60),
  startDate: isoDate,
  endDate: isoDate,
});
const makeCurrentSchema = z.object({ promoteYears: z.boolean().default(false) });
module.exports = { ...module.exports, semesterParamSchema, semesterBodySchema, makeCurrentSchema };
