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
// A semester code: AS2026 (Autumn) or SS2027 (Spring). Optional; default = current semester.
const academicSession = z.preprocess(blankToUndef, z.string().trim().toUpperCase().regex(/^(AS|SS)\d{4}$/, 'must look like AS2026').optional());

module.exports = { z, blankToUndef, id, optionalText, optionalNumber, lat, lng, isoDate, month, academicSession };
