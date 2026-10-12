// Reusable zod pieces.
const { z } = require('zod');

// '' from a form field means "not given".
const blankToUndef = (v) => (v === '' || v === null ? undefined : v);

const id = z.string().trim().min(1, 'is required').max(40);
const optionalText = (max) => z.preprocess(blankToUndef, z.string().trim().max(max).optional());
const optionalNumber = (schema) => z.preprocess(blankToUndef, z.coerce.number().pipe(schema).optional());
const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'must be a date (YYYY-MM-DD)');
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must look like 2026-10');

module.exports = { z, blankToUndef, id, optionalText, optionalNumber, lat, lng, isoDate, month };
