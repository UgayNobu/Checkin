const { z, optionalText } = require('./common');

const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: optionalText(20),
  prefs: z.record(z.boolean()).optional(),
});

module.exports = { updateProfileSchema };
