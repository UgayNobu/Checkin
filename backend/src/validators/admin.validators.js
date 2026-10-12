const { z, id, optionalText, optionalNumber } = require('./common');

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
const userPatchSchema = z.object({ active: z.boolean().optional(), name: z.string().trim().min(2).max(100).optional() });

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
