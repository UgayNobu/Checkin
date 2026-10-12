// Multer keeps the upload in memory; lib/storage decides where it is saved.
const multer = require('multer');
const { FILES } = require('../config/constants');
const { BadRequest } = require('../utils/errors');

const make = ({ maxBytes, mimes }, label) => multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes, files: 1 },
  fileFilter: (req, file, cb) => (mimes.includes(file.mimetype) ? cb(null, true) : cb(BadRequest(`Please upload ${label}`, 'FILE_TYPE'))),
});

const evidenceUpload = make(FILES.evidence, 'a PDF, PNG, JPG or WebP file (max 10 MB)').single('file');
const avatarUpload = make(FILES.avatar, 'a PNG, JPG or WebP image (max 2 MB)').single('file');

module.exports = { evidenceUpload, avatarUpload };
