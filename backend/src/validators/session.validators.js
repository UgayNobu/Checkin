const { z, id, optionalText, optionalNumber, lat, lng } = require('./common');

// Either start a new session for a module, or re-open one that already exists (sessionId).
const startSessionSchema = z.object({
  module: id.optional(),
  sessionId: id.optional(),
  slot: id.optional(),            // start from a timetable slot (fills module, type, hours and room)
  room: optionalText(50),
  type: z.enum(['theory', 'practical']).default('theory'),
  hours: z.coerce.number().min(0.5).max(6).default(1),
  lat, lng,
  minutes: optionalNumber(z.number().int().min(1).max(120)),   // how long the code stays valid
  radius: optionalNumber(z.number().int().min(5).max(500)),    // geofence in metres
}).refine((b) => b.module || b.sessionId || b.slot, { message: 'Choose a module', path: ['module'] });

const sessionIdParamSchema = z.object({ id });
const flaggedParamSchema = z.object({ id, attendanceId: id });
const flaggedBodySchema = z.object({ note: optionalText(60) }).default({});
const listMySessionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: z.enum(['scheduled', 'ongoing', 'ended']).optional(),
});

module.exports = { startSessionSchema, sessionIdParamSchema, flaggedParamSchema, flaggedBodySchema, listMySessionsQuerySchema };
