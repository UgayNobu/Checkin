const { z } = require('./common');

const noNull = (v) => (v === null ? undefined : v); // null from the form = "not sent"

// Profile photo: small image saved as text, max ~300 KB
const photo = z
  .string()
  .regex(/^data:image\/(jpeg|png|webp);base64,/, 'Photo must be a JPG, PNG or WEBP image')
  .max(300000, 'Photo is too large');

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.preprocess(noNull, z.string().trim().regex(/^(\+?[0-9 ]{8,15})?$/, 'Phone number: 8–15 digits, e.g. 17123456').optional()),
  designation: z.preprocess(noNull, z.string().trim().max(60).optional()), // e.g. Lecturer
  // prefs: switches (true/false) + optional photo
  prefs: z.object({ photo: photo.or(z.literal('')).optional() }).catchall(z.boolean()).optional(), // photo '' = remove it
});

module.exports = { updateProfileSchema };