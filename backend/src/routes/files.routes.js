// Mounted at /api/files. Serves files saved in the stored_files table.
//
// No login check here on purpose: <img> and <iframe> can't send the
// Authorization header. Instead every link is signed and runs out after a few
// hours (see signedFilePath in lib/storage.js), and the API only hands links
// to people allowed to see the file (canSee in evidence.service.js).
// So a forwarded or copied link stops working.
const { Router } = require('express');
const { readFile, checkFileLink } = require('../lib/storage');
const { env } = require('../config/env');
const { NotFound, Forbidden } = require('../utils/errors');

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/:id', async (req, res, next) => {
  try {
    if (!UUID.test(req.params.id)) throw NotFound('File not found');
    if (!checkFileLink(req.params.id, req.query.exp, req.query.sig)) {
      throw Forbidden('This link has expired. Open the document again from CheckIn.', 'LINK_EXPIRED');
    }
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
