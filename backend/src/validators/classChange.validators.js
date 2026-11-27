const { z, id, optionalText, blankToUndef } = require('./common');

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date (YYYY-MM-DD)');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be a time like 09:00');
const reason = z.enum(['on_leave', 'college_event', 'exam', 'holiday', 'make_up', 'extra_lecture', 'revision', 'swap', 'other'], {
  error: 'Choose a reason',
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
    // practical only: where it happens and how close students must be
    place: optionalText(100),
    radius: z.preprocess(blankToUndef, z.coerce.number().int('Radius must be whole metres').min(5, 'Radius must be 5–500 m').max(500, 'Radius must be 5–500 m').optional()),
    counts: z.boolean().default(true), reason, note,
  }),
]).refine((b) => b.reason !== 'other' || b.note, { message: 'Write a short note for "Other"', path: ['note'] })
  // a practical has no room, so its place is what tells students where to come
  .refine((b) => b.type !== 'extra' || b.sessionType !== 'practical' || !!b.place, { message: 'Choose the place of the practical', path: ['place'] });

const idParamSchema = z.object({ id });

/** Swap two classes with another tutor (swap.service.js). Each side: a timetable class + date, or an extra class. */
const opt = (s) => z.preprocess(blankToUndef, s.optional());
const swapSchema = z.object({
  slot: opt(id), date: opt(day), change: opt(id),
  withTutor: id, withSlot: opt(id), withDate: opt(day), withChange: opt(id),
  note: optionalText(150),
})
  .refine((b) => (b.slot && b.date && !b.change) || (!b.slot && b.change), { message: 'Choose your class', path: ['slot'] })
  .refine((b) => (b.withSlot && b.withDate && !b.withChange) || (!b.withSlot && b.withChange), { message: 'Choose their class', path: ['withSlot'] });
const swapOptionsQuerySchema = z.object({ tutor: id, date: day });

module.exports = { rangeQuerySchema, checkQuerySchema, createSchema, idParamSchema, swapSchema, swapOptionsQuerySchema };
