// A student's programme is saved as "B.E. Software Engineering" and their department as
// "Software Engineering"; the programmes table uses "B.E. Software Engineering".
// These helpers treat all spellings ("B.E.", "BE" or none) as the same programme.
const short = (n) => (n || '').replace(/^(B\.?\s?E\.?)\s+/i, '').trim();

/** Key for grouping: "B.E. Software Engineering" and "Software Engineering" → "software engineering". */
const progKey = (n) => short(n).toLowerCase();

/** Prisma OR filter: students whose programme or department is this programme, with or without "B.E.". */
const programmeMatch = (name) => [...new Set([name, short(name)])].flatMap((v) => [
  { programme: { equals: v, mode: 'insensitive' } },
  { department: { equals: v, mode: 'insensitive' } },
]);

module.exports = { progKey, programmeMatch };
