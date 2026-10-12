// Mounted at /api — college structure (public, used by sign-up), rooms and the weekly timetable.
const { Router } = require('express');
const c = require('../controllers/catalog.controller');
const { requireAuth } = require('../middleware/requireAuth');
const { validateQuery } = require('../middleware/validate');
const v = require('../validators/catalog.validators');

const router = Router();

// Public (no login): the sign-up form needs these
router.get('/departments', c.departments);
router.get('/programs', validateQuery(v.programsQuerySchema), c.programs);

// Any logged-in user
router.get('/rooms', requireAuth, c.rooms);
router.get('/timetable', requireAuth, validateQuery(v.timetableQuerySchema), c.timetable);

module.exports = router;
