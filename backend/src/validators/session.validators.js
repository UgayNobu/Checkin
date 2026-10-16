const { z, id, optionalText, optionalNumber, lat, lng, academicSession } = require('./common');
const { BUILDING_KEYS } = require('../config/buildings');

// Either start a new session for a module, or re-open one that already exists (sessionId).
const startSessionSchema = z.object({
  module: id.optional(),
  sessionId: id.optional(),
  slot: id.optional(),            // start from a timetable slot (fills module, type, hours and room)
  change: id.optional(),          // start an extra class, or a class you are covering
  room: optionalText(50),
  type: z.enum(['theory', 'practical']).default('theory'),
  hours: z.coerce.number().min(0.5).max(6).default(1),
  // Where students must be:
  //   building → inside one of the campus building outlines (config/buildings.js), no tutor GPS needed
  //   workshop → within `radius` metres of the tutor's own GPS (practicals in a workshop)
  mode: z.enum(['building', 'workshop']).default('workshop'),
  building: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.enum(BUILDING_KEYS).optional()),
  lat: lat.optional(), lng: lng.optional(),
  minutes: optionalNumber(z.number().int().min(1).max(120)),   // how long the code stays valid
  radius: optionalNumber(z.number().int().min(5).max(500)),    // workshop geofence in metres
})
  .refine((b) => b.module || b.sessionId || b.slot || b.change, { message: 'Choose a module', path: ['module'] })
  .refine((b) => b.mode !== 'building' || b.building || b.room || b.slot || b.change, { message: 'Choose the building', path: ['building'] })
  .refine((b) => b.mode !== 'workshop' || (b.lat !== undefined && b.lng !== undefined), { message: 'Your location is needed for a workshop session', path: ['lat'] })
  .refine((b) => b.mode !== 'workshop' || b.radius !== undefined, { message: 'Enter the workshop radius in metres', path: ['radius'] });

const sessionIdParamSchema = z.object({ id });
const flaggedParamSchema = z.object({ id, attendanceId: id });
const flaggedBodySchema = z.object({ note: optionalText(60) }).default({});
const listMySessionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: z.enum(['scheduled', 'ongoing', 'ended']).optional(),
  session: academicSession, // semester, default current
});

module.exports = { startSessionSchema, sessionIdParamSchema, flaggedParamSchema, flaggedBodySchema, listMySessionsQuerySchema };
