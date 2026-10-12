// Mounted at /api/modules — browsing/joining (students) and key + roster (teachers).
const { Router } = require('express');
const c = require('../controllers/module.controller');
const s = require('../controllers/student.controller');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole } = require('../middleware/requireRole');
const { validateBody, validateParams } = require('../middleware/validate');
const v = require('../validators/module.validators');

const router = Router();
router.use(requireAuth);
const id = validateParams(v.moduleIdParamSchema);

// Student
router.get('/browse', requireRole('student'), s.browse);
router.post('/enrol', requireRole('student'), validateBody(v.enrolBodySchema), s.enrol);

// Teacher (students list is also open to admin + management)
router.get('/:id/key/suggest', requireRole('teacher'), id, c.suggestKey);
router.put('/:id/key', requireRole('teacher'), id, validateBody(v.enrolmentKeyBodySchema), c.setKey);
router.get('/:id/students', requireRole('teacher', 'admin', 'management'), id, c.students);
router.post('/:id/students', requireRole('teacher'), id, validateBody(v.addStudentBodySchema), c.addStudent);
router.delete('/:id/students/:studentId', requireRole('teacher', 'admin'), c.removeStudent);

module.exports = router;
