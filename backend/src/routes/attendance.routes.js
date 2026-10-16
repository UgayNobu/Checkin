// Mounted at /api/attendance (and /api/checkin for the check-in alone)
const { Router } = require('express');
const checkin = require('../controllers/checkin.controller');
const student = require('../controllers/student.controller');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole } = require('../middleware/requireRole');
const { validateBody, validateQuery } = require('../middleware/validate');
const { checkinLimiter } = require('../middleware/rateLimits');
const { checkInSchema } = require('../validators/checkin.validators');
const { monthQuerySchema } = require('../validators/attendance.validators');

const router = Router();
router.use(requireAuth, requireRole('student'));

router.post('/checkin', checkinLimiter, validateBody(checkInSchema), checkin.checkIn);
router.get('/live', checkin.live); // classes open for check-in right now + building outlines (the 5 cards)
router.get('/me', validateQuery(monthQuerySchema), student.calendar); // ?month=2026-10

// Same handler, mounted at /api/checkin (design-doc path).
const checkinRouter = Router();
checkinRouter.post('/', requireAuth, requireRole('student'), checkinLimiter, validateBody(checkInSchema), checkin.checkIn);

module.exports = { attendanceRouter: router, checkinRouter };
