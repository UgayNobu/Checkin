// Mounted at /api/me (existing frontend) and /api/profile (design doc name)
const { Router } = require('express');
const c = require('../controllers/profile.controller');
const auth = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/requireAuth');
const { validateBody } = require('../middleware/validate');
const { avatarUpload } = require('../middleware/upload');
const { updateProfileSchema } = require('../validators/profile.validators');
const { changePasswordSchema } = require('../validators/auth.validators');

const router = Router();
router.use(requireAuth);

router.get('/', c.get);
router.put('/', validateBody(updateProfileSchema), c.update);
router.put('/password', validateBody(changePasswordSchema), auth.changePassword);
router.post('/avatar', avatarUpload, c.uploadAvatar);
router.delete('/avatar', c.removeAvatar);

module.exports = router;
