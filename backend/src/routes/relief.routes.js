// Mounted at /api/evidence and /api/relief (both names are used).
const { Router } = require('express');
const c = require('../controllers/relief.controller');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole } = require('../middleware/requireRole');
const { validateBody, validateParams, validateQuery } = require('../middleware/validate');
const { reliefUpload } = require('../middleware/upload');
const v = require('../validators/relief.validators');

const router = Router();
router.use(requireAuth);
const staff = requireRole('teacher', 'admin', 'management');
const id = validateParams(v.reliefIdParamSchema);

// Student — multer runs first so the form fields exist before validation.
router.post('/', requireRole('student'), reliefUpload, validateBody(v.submitReliefSchema), c.submit);
router.get('/mine', requireRole('student'), c.mine);

// Staff
router.get('/', staff, validateQuery(v.listReliefQuerySchema), c.list);
router.patch('/:id', staff, id, validateBody(v.reviewReliefSchema), c.review);
router.post('/:id/review', staff, id, validateBody(v.reviewReliefSchema), c.review);

// Anyone allowed to see it (checked in the service). Registered last so /mine isn't taken as an id.
router.get('/:id', id, c.getOne);

module.exports = router;
