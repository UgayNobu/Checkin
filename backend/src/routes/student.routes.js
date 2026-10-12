// Mounted at /api/student
const { Router } = require('express');
const c = require('../controllers/student.controller');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole } = require('../middleware/requireRole');
const { validateBody, validateParams, validateQuery } = require('../middleware/validate');
const { moduleIdParamSchema, enrolBodySchema } = require('../validators/module.validators');
const { monthQuerySchema } = require('../validators/attendance.validators');

const router = Router();
router.use(requireAuth, requireRole('student'));

router.get('/dashboard', c.dashboard);
router.get('/summary', c.summary);
router.get('/calendar', validateQuery(monthQuerySchema), c.calendar);
router.get('/modules', c.browse);
router.get('/modules/:id/records', validateParams(moduleIdParamSchema), c.moduleRecords);
router.post('/enrol', validateBody(enrolBodySchema), c.enrol);

module.exports = router;
