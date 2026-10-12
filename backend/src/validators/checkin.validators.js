const { z, blankToUndef } = require('./common');

const coord = (min, max) => z.preprocess(blankToUndef, z.coerce.number().min(min).max(max).optional());

const checkInSchema = z.object({
  code: z.string().trim().min(4, 'Enter the check-in code').max(12),
  lat: coord(-90, 90),
  lng: coord(-180, 180),
  accuracy: z.preprocess(blankToUndef, z.coerce.number().min(0).optional()),
  permissionDenied: z.coerce.boolean().optional(),
});

module.exports = { checkInSchema };
