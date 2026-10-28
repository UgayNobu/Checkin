// Mounted at /api/management — management and admin (read-only views).
const { Router } = require('express');
const c = require('../controllers/management.controller');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole } = require('../middleware/requireRole');
const { validateParams, validateQuery } = require('../middleware/validate');
const v = require('../validators/management.validators');
const changes = require('../controllers/classChange.controller');
const { rangeQuerySchema } = require('../validators/classChange.validators');
const router = Router();
router.use(requireAuth, requireRole('management', 'admin'));

router.get('/overview', validateQuery(v.sessionQuerySchema), c.overview);
router.get('/department/:name', validateParams(v.deptParamSchema), validateQuery(v.sessionQuerySchema), c.department);
router.get('/module/:id', validateParams(v.idParamSchema), validateQuery(v.sessionQuerySchema), c.module);
router.get('/student/:id', validateParams(v.idParamSchema), validateQuery(v.studentQuerySchema), c.student);
router.get('/teachers', validateQuery(v.sessionQuerySchema), c.teachers);
router.get('/history', validateQuery(v.historyQuerySchema), c.history);
router.get('/calendar', validateQuery(v.calendarQuerySchema), c.calendar);
// cancelled / cover / extra classes, and timetable classes nobody took
router.get('/class-changes', validateQuery(rangeQuerySchema), changes.management);
module.exports = router;
