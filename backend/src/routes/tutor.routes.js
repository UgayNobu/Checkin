// Mounted at /api/teacher (existing) and /api/tutor (design doc name) — teachers only.
const { Router } = require('express');
const c = require('../controllers/tutor.controller');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole } = require('../middleware/requireRole');
const { validateParams } = require('../middleware/validate');
const v = require('../validators/tutor.validators');

const router = Router();
router.use(requireAuth, requireRole('teacher'));
const mod = validateParams(v.recordParamsSchema);

router.get('/dashboard', c.dashboard);
router.get('/modules', c.modules);
router.get('/modules/export.pdf', c.modulesPdf);
router.get('/reports', c.reports);
// Export routes BEFORE /records/:moduleId/:studentId so "csv"/"pdf" isn't read as a student ID.
router.get('/records-export/:moduleId/csv', mod, c.recordsCsv);
router.get('/records-export/:moduleId/pdf', mod, c.recordsPdf);
router.get('/records/:moduleId', mod, c.records);
router.get('/records/:moduleId/:studentId', validateParams(v.studentRecordParamsSchema), c.studentRecord);

module.exports = router;
