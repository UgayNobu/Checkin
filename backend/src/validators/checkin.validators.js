const { z, blankToUndef } = require('./common');

const coord = (min, max) => z.preprocess(blankToUndef, z.coerce.number().min(min).max(max).optional());

const checkInSchema = z.object({
  code: z.string().trim().min(4, 'Enter the check-in code').max(12),
  lat: coord(-90, 90),
  lng: coord(-180, 180),
  accuracy: z.preprocess(blankToUndef, z.coerce.number().min(0).optional()),
  permissionDenied: z.coerce.boolean().optional(),
  locationError: z.coerce.boolean().optional(), // the browser's location API failed
  offline: z.coerce.boolean().optional(),       // the app held the check-in back because of bad internet
});

module.exports = { checkInSchema };
