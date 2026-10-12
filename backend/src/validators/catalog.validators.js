const { z, optionalText } = require('./common');

const programsQuerySchema = z.object({ level: optionalText(30) });
const timetableQuerySchema = z.object({
  program: z.string().trim().min(1, 'Choose a programme').max(100),
  year: z.coerce.number().int().min(1, 'Choose a year').max(5),
});

module.exports = { programsQuerySchema, timetableQuerySchema };
