const { z, id, optionalText } = require('./common');
const { isStrongPassword, PASSWORD_RULE } = require('../utils/password');

const strongPassword = z.string().refine(isStrongPassword, PASSWORD_RULE);

// Old register form (student creates an account / tutor requests one)
const registerSchema = z.object({
  userId: id,
  name: z.string().trim().min(2, 'is required').max(100),
  email: z.string().trim().toLowerCase().email('must be a valid email'),
  password: strongPassword,
  role: z.enum(['student', 'teacher']).default('student'),
  programme: optionalText(100),
  department: optionalText(100),
});

const loginSchema = z.object({ userId: id, password: z.string().min(1, 'is required') });

// Roster sign-up: the ID already exists (loaded by admin), the person only sets a password.
const lookupIdQuerySchema = z.object({ id });
const rosterSignupSchema = z.object({ userId: id, password: strongPassword });

// Accepts { current, next } (existing frontend) or { currentPassword, newPassword } (design doc).
const changePasswordSchema = z.preprocess(
  (b) => ({ current: b?.current ?? b?.currentPassword, next: b?.next ?? b?.newPassword }),
  z.object({ current: z.string().min(1, 'Current password is required'), next: strongPassword }),
);

module.exports = { registerSchema, loginSchema, lookupIdQuerySchema, rosterSignupSchema, changePasswordSchema };
