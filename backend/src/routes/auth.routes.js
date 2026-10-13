// Mounted at /api/auth
const { Router } = require('express');
const c = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/requireAuth');
const { validateBody, validateQuery } = require('../middleware/validate');
const { authLimiter, lookupLimiter, resetLimiter } = require('../middleware/rateLimits');
const v = require('../validators/auth.validators');

const router = Router();

// Public
router.post('/register', authLimiter, validateBody(v.registerSchema), c.register);           // full sign-up form
router.post('/login', authLimiter, validateBody(v.loginSchema), c.login);
router.post('/logout', c.logout);
router.get('/me', c.me);                                                                      // null when logged out
router.get('/lookup-id', lookupLimiter, validateQuery(v.lookupIdQuerySchema), c.lookupId);    // roster sign-up step 1
router.post('/student/signup', authLimiter, validateBody(v.rosterSignupSchema), c.studentSignup); // roster sign-up step 2
router.post('/forgot-password', resetLimiter, validateBody(v.forgotPasswordSchema), c.forgotPassword); // emails a 6-digit code
router.post('/reset-password', resetLimiter, validateBody(v.resetPasswordSchema), c.resetPassword);   // code + new password
router.post('/tutor/request', authLimiter, validateBody(v.rosterSignupSchema), c.tutorRequest);

// Logged in
router.post('/change-password', requireAuth, validateBody(v.changePasswordSchema), c.changePassword);

module.exports = router;
