// Mounted at /api/files. Serves files saved in the stored_files table.
//
// No login check here on purpose: <img> and <iframe> can't send the
// Authorization header. The id is a random UUID (impossible to guess)
// and the API only gives it to people allowed to see the file
// (see canSee in evidence.service.js) — the same idea as a signed URL.
const { Router } = require('express');
const { readFile } = require('../lib/storage');
const { env } = require('../config/env');
const { NotFound } = require('../utils/errors');

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/:id', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) throw NotFound('File not found');
    const f = await readFile(req.params.id);
    if (!f) throw NotFound('File not found');

    const name = (f.originalName || 'document').replace(/[^\w.\- ]/g, '_');
    res.set({
      'Content-Type': f.mimeType,
      'Content-Disposition': `inline; filename="${name}"`,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      // Let the frontend (a different port / domain) show it in an <iframe>.
      'Content-Security-Policy': `default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self' ${env.isProd ? env.frontendUrls.join(' ') : '*'}`,
    });
    res.removeHeader('X-Frame-Options');
    res.send(Buffer.from(f.content));
  } catch (e) { next(e); }
});

module.exports = router;
