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
router.get('/academic-sessions', requireAuth, c.semesters); // every semester, newest first (for the semester picker)
router.get('/academic-sessions/current', requireAuth, c.currentSemester); // e.g. { code: 'AS2026', name: 'Autumn Semester 2026', … }
router.get('/timetable', requireAuth, validateQuery(v.timetableQuerySchema), c.timetable);

module.exports = router;
