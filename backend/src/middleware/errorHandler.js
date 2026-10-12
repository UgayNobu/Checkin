// ─────────────────────────────────────────────────────────────
// Last middleware. Every error ends up here and is sent as
// { error, code } — the frontend shows `error` to the user.
// ─────────────────────────────────────────────────────────────
const { HttpError } = require('../utils/errors');
const { env } = require('../config/env');

function notFound(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}`, code: 'ROUTE_NOT_FOUND' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return; // e.g. a PDF stream that already started

  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });

  // Prisma: unique constraint / record not found / bad foreign key
  if (err.code === 'P2002') return res.status(409).json({ error: 'That ID, email or record already exists', code: 'DUPLICATE' });
  if (err.code === 'P2025') return res.status(404).json({ error: 'Record not found', code: 'NOT_FOUND' });
  if (err.code === 'P2003') return res.status(400).json({ error: 'A linked record does not exist', code: 'BAD_REFERENCE' });

  // Multer upload errors (file too big, etc.)
  if (err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large' : err.message;
    return res.status(400).json({ error: msg, code: 'UPLOAD_ERROR' });
  }

  // Malformed JSON body
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body', code: 'BAD_JSON' });

  console.error('[error]', err);
  res.status(500).json({ error: env.isProd ? 'Something went wrong' : err.message, code: 'INTERNAL' });
}

module.exports = { errorHandler, notFound };
