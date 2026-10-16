// Mounted at /api/sessions — teachers only.
const { Router } = require('express');
const c = require('../controllers/session.controller');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole } = require('../middleware/requireRole');
const { validateBody, validateParams, validateQuery } = require('../middleware/validate');
const v = require('../validators/session.validators');
const { publicBuildings } = require('../config/buildings');

const router = Router();
router.use(requireAuth, requireRole('teacher'));
const id = validateParams(v.sessionIdParamSchema);

router.post('/', validateBody(v.startSessionSchema), c.start);
router.post('/start', validateBody(v.startSessionSchema), c.start); // design-doc path
router.get('/buildings', (req, res) => res.json(publicBuildings())); // for the building picker
router.get('/mine', validateQuery(v.listMySessionsQuerySchema), c.mine);
router.get('/:id/live', id, c.live);
router.get('/:id/roster', id, c.roster);
router.post('/:id/end', id, c.end);
router.post('/:id/flagged/:attendanceId/accept', validateParams(v.flaggedParamSchema), validateBody(v.flaggedBodySchema), c.accept);
router.post('/:id/flagged/:attendanceId/reject', validateParams(v.flaggedParamSchema), validateBody(v.flaggedBodySchema), c.reject);
router.post('/:id/students/:studentId/mark', c.mark); // body { status: 'present' | 'absent' }

module.exports = router;
