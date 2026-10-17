const { z, id, optionalText } = require('./common');
const { isStrongPassword, PASSWORD_RULE } = require('../utils/password');

const strongPassword = z.string().refine(isStrongPassword, PASSWORD_RULE);

// College formats: student ID = 8 digits (02250368), staff ID = CST- + letters/digits (CST-0142)
const STUDENT_ID = /^\d{8}$/;
const STAFF_ID = /^CST-[A-Z0-9]{2,6}$/i;
const COLLEGE_EMAIL = /@rub\.edu\.bt$/i;

// Sign-up form (student creates an account / tutor requests one)
const registerSchema = z.object({
  userId: z.string().trim(),
  name: z.string().trim().min(2, 'must be at least 2 characters').max(100)
    .regex(/^[A-Za-z][A-Za-z .'-]*$/, 'can only contain letters, spaces, dots, hyphens and apostrophes'),
  email: z.string().trim().toLowerCase().email('must be a valid email').regex(COLLEGE_EMAIL, 'must be your college email (@rub.edu.bt)'),
  password: strongPassword,
  role: z.enum(['student', 'teacher']).default('student'),
  programme: optionalText(100),
  department: optionalText(100),
}).superRefine((b, ctx) => {
  const student = b.role === 'student';
  if (student && !STUDENT_ID.test(b.userId)) ctx.addIssue({ code: 'custom', path: ['userId'], message: 'must be your 8-digit student number, e.g. 02250368' });
  if (!student && !STAFF_ID.test(b.userId)) ctx.addIssue({ code: 'custom', path: ['userId'], message: 'must be your staff ID, e.g. CST-0142' });
  if (student && !b.programme) ctx.addIssue({ code: 'custom', path: ['programme'], message: 'Please choose your programme' });
  if (!student && !b.department) ctx.addIssue({ code: 'custom', path: ['department'], message: 'Please choose your department' });
});

// Forgot password: step 1 asks for a code, step 2 uses it
const forgotPasswordSchema = z.object({ userId: z.string().trim().min(1, 'Enter your ID').max(20) });
const resetPasswordSchema = z.object({
  userId: z.string().trim().min(1, 'Enter your ID').max(20),
  code: z.string().trim().regex(/^\d{6}$/, 'must be the 6-digit code from the email'),
  password: strongPassword,
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

module.exports = { registerSchema, forgotPasswordSchema, resetPasswordSchema, loginSchema, lookupIdQuerySchema, rosterSignupSchema, changePasswordSchema };
