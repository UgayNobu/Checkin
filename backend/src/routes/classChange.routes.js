// Mounted at /api/class-changes — cancelled, cover and extra classes (classChange.service.js).
const { Router } = require('express');
const c = require('../controllers/classChange.controller');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole } = require('../middleware/requireRole');
const { validateBody, validateParams, validateQuery } = require('../middleware/validate');
const v = require('../validators/classChange.validators');

const router = Router();
router.use(requireAuth);
const tutor = requireRole('teacher');

router.get('/', validateQuery(v.rangeQuerySchema), c.list); // changes that matter to you, ?from=&to=
router.get('/check', tutor, validateQuery(v.checkQuerySchema), c.check); // free periods / rooms / clashes
router.get('/tutors', tutor, c.tutors); // who can cover
router.post('/', tutor, validateBody(v.createSchema), c.create);
// Swap two classes with another tutor: they accept or reject (swap.service.js)
router.get('/swaps', tutor, c.swapList);
router.get('/swaps/options', tutor, validateQuery(v.swapOptionsQuerySchema), c.swapOptions); // their classes that day
router.post('/swaps', tutor, validateBody(v.swapSchema), c.swapRequest);
router.post('/swaps/:id/accept', tutor, validateParams(v.idParamSchema), c.swapAccept);
router.post('/swaps/:id/reject', tutor, validateParams(v.idParamSchema), c.swapReject);
router.post('/swaps/:id/cancel', tutor, validateParams(v.idParamSchema), c.swapCancel);
router.delete('/:id', tutor, validateParams(v.idParamSchema), c.remove); // undo

module.exports = router;
