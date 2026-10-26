// Mounted at /api/admin. Changes are admin-only; reports are shared with management.
const { Router } = require('express');
const c = require('../controllers/admin.controller');
const { requireAuth } = require('../middleware/requireAuth');
const { requireRole } = require('../middleware/requireRole');
const { validateBody, validateParams, validateQuery } = require('../middleware/validate');
const v = require('../validators/admin.validators');

const router = Router();
router.use(requireAuth);
const admin = requireRole('admin');
const both = requireRole('admin', 'management');

// Overview + programmes
router.get('/overview', both, c.overview);
router.get('/programs', both, c.programs);
router.post('/programs', admin, validateBody(v.programNameSchema), c.createProgram);
router.put('/programs', admin, validateBody(v.programRenameSchema), c.renameProgram);
router.get('/programmes/:name/report', both, validateParams(v.programParamSchema), c.programmeReport);
router.get('/programmes/:name/export.csv', both, validateParams(v.programParamSchema), c.programmeCsv);

// Users
router.get('/users', admin, validateQuery(v.usersQuerySchema), c.users);
router.patch('/users/:id', admin, validateParams(v.userIdParamSchema), validateBody(v.userPatchSchema), c.patchUser);

// Modules
router.get('/modules', admin, validateQuery(v.modulesQuerySchema), c.modules);
router.post('/modules', admin, validateBody(v.moduleBodySchema), c.createModule);
router.put('/modules/:id', admin, validateParams(v.moduleIdParamSchema), validateBody(v.moduleBodySchema), c.updateModule);

// Tutor accounts: the admin creates them and assigns their modules (no sign-up, no approval)
router.get('/tutors', admin, c.tutors);
router.post('/tutors', admin, validateBody(v.tutorCreateSchema), c.createTutor);
router.get('/tutors/:id/modules', admin, validateParams(v.userIdParamSchema), c.tutorModules);
router.post('/tutors/:id/modules', admin, validateParams(v.userIdParamSchema), validateBody(v.assignModulesSchema), c.assignTutorModules);
router.post('/tutors/:id/reset-password', admin, validateParams(v.userIdParamSchema), c.resetTutorPassword);

// Old tutor sign-up requests (from before approval was removed)
router.get('/tutors/pending', both, c.pendingTutors);
router.post('/tutors/:id/approve', admin, validateParams(v.userIdParamSchema), c.approveTutor);
router.post('/tutors/:id/reject', admin, validateParams(v.userIdParamSchema), c.rejectTutor);

// Semesters: list (admin + management), add one, start a new semester (admin)
router.get('/academic-sessions', both, c.semesters);
router.post('/academic-sessions', admin, validateBody(v.semesterBodySchema), c.createSemester);
router.post('/academic-sessions/:code/make-current', admin, validateParams(v.semesterParamSchema), validateBody(v.makeCurrentSchema), c.makeCurrentSemester);

// Audit log
router.get('/audit-logs', both, validateQuery(v.auditQuerySchema), c.auditLogs);
router.get('/audit-actions', both, c.auditActions);

// Reports + job
router.get('/reports/at-risk', both, validateQuery(v.atRiskQuerySchema), c.atRisk);
router.get('/reports/at-risk/export.csv', both, validateQuery(v.atRiskQuerySchema), c.atRiskCsv);
router.post('/jobs/low-attendance', admin, c.lowAttendanceJob);

module.exports = router;
