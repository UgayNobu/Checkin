const { z, id, optionalText, blankToUndef } = require('./common');

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date (YYYY-MM-DD)');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be a time like 09:00');
const reason = z.enum(['on_leave', 'college_event', 'exam', 'holiday', 'make_up', 'extra_lecture', 'revision', 'swap', 'other'], {
  errorMap: () => ({ message: 'Choose a reason' }),
});
const bool = z.preprocess((v) => (v === 'false' || v === false ? false : v === 'true' || v === true ? true : undefined), z.boolean().optional());

/** Date range for listing changes (at most 62 days). */
const rangeQuerySchema = z.object({ from: day, to: day })
  .refine((q) => q.to >= q.from, { message: 'to must be on or after from', path: ['to'] })
  .refine((q) => (new Date(q.to) - new Date(q.from)) / 86400000 <= 62, { message: 'Choose at most 2 months', path: ['to'] });

/** Extra class form: free periods, free rooms and clashes. */
const checkQuerySchema = z.object({
  module: id, date: day,
  start: z.preprocess(blankToUndef, time.optional()),
  end: z.preprocess(blankToUndef, time.optional()),
  room: z.preprocess(blankToUndef, id.optional()),
  counts: bool,
});

const note = optionalText(150);
const createSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cancelled'), slot: id, date: day, reason, note }),
  z.object({ type: z.literal('cover'), slot: id, date: day, coverTutor: id, reason, note }),
  z.object({
    type: z.literal('extra'), module: id, date: day, start: time, end: time,
    room: z.preprocess(blankToUndef, id.optional()),
    sessionType: z.enum(['theory', 'practical']).default('theory'),
    counts: z.boolean().default(true), reason, note,
  }),
]).refine((b) => b.reason !== 'other' || b.note, { message: 'Write a short note for "Other"', path: ['note'] });

const idParamSchema = z.object({ id });

module.exports = { rangeQuerySchema, checkQuerySchema, createSchema, idParamSchema };
