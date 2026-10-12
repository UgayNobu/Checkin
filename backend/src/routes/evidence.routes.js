// Mounted at /api/evidence.
const { Router } = require('express');
const c = require('../controllers/evidence.controller');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole } = require('../middleware/requireRole');
const { validateBody, validateParams, validateQuery } = require('../middleware/validate');
const { evidenceUpload } = require('../middleware/upload');
const v = require('../validators/evidence.validators');

const router = Router();
router.use(requireAuth);
const staff = requireRole('teacher', 'admin', 'management');
const id = validateParams(v.evidenceIdParamSchema);

// Student — multer runs first so the form fields exist before validation.
router.post('/', requireRole('student'), evidenceUpload, validateBody(v.submitEvidenceSchema), c.submit);
router.get('/mine', requireRole('student'), c.mine);

// Staff
router.get('/', staff, validateQuery(v.listEvidenceQuerySchema), c.list);
router.patch('/:id', staff, id, validateBody(v.reviewEvidenceSchema), c.review);
router.post('/:id/review', staff, id, validateBody(v.reviewEvidenceSchema), c.review);

// Anyone allowed to see it (checked in the service). Registered last so /mine isn't taken as an id.
router.get('/:id', id, c.getOne);

module.exports = router;
