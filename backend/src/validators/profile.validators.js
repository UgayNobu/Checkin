const { z, } = require('./common');

const noNull = (v) => (v === null ? undefined : v); // null from the form = "not sent"
const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  // phone: digits (optionally + and spaces), or '' to clear it
  phone: z.preprocess(noNull, z.string().trim().regex(/^(\+?[0-9 ]{8,15})?$/, 'Phone number: 8–15 digits, e.g. 17123456').optional()),
  designation: z.preprocess(noNull, z.string().trim().max(60).optional()), // e.g. Lecturer
  prefs: z.record(z.boolean()).optional(),
});

module.exports = { updateProfileSchema };
