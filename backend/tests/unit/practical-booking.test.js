// Booking a practical class (classChange.service.js create): no room, a place and a radius instead.
const DAY = '2099-01-05'; // a Monday far ahead, so it is never "already over"
const mockDb = {};
const reset = () => Object.assign(mockDb, { changes: [], notes: [], roomLookups: 0 });

jest.mock('../../src/lib/academicSession', () => ({ currentAcademicSession: async () => 'AS' }));
jest.mock('../../src/services/notifications.service', () => ({
  notify: async (userId, message) => { mockDb.notes.push({ userId, message }); },
}));
jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    academicSession: { findUnique: async () => null },
    section: { findMany: async () => [{ id: 'S1', moduleId: 'M1', tutorId: 'T1', tutor: { name: 'Tutor' } }] },
    timetableSlot: { findMany: async () => [] },
    classChange: {
      findMany: async () => [],
      create: async ({ data }) => {
        const c = { id: `CC${mockDb.changes.length + 1}`, ...data, module: { code: 'SUR201', name: 'Surveying' }, room: data.roomId ? { id: data.roomId, name: 'IT-05' } : null };
        mockDb.changes.push(c);
        return c;
      },
    },
    classSession: { findMany: async () => [] },
    module: { findUnique: async () => ({ programId: 'P1', year: 2 }) },
    enrollment: { findMany: async () => [{ studentId: 'ST1' }], groupBy: async () => [] },
    room: { findUnique: async () => { mockDb.roomLookups++; return { id: 'R5' }; } },
  },
}));

const svc = require('../../src/services/classChange.service');
const { createSchema } = require('../../src/validators/classChange.validators');
const book = (extra) => svc.create('T1', { type: 'extra', module: 'M1', date: DAY, start: '14:00', end: '15:00', counts: true, reason: 'extra_lecture', ...extra });

beforeEach(reset);

test('TC-UNIT-115: a practical is booked with a place and radius, never a room', async () => {
  const o = await book({ sessionType: 'practical', room: 'R5', place: 'Survey field', radius: 50 });
  const saved = mockDb.changes[0];
  expect(saved.roomId).toBeNull(); // the room sent by mistake is ignored
  expect(mockDb.roomLookups).toBe(0);
  expect(saved.place).toBe('Survey field');
  expect(saved.radiusM).toBe(50);
  expect(o.place).toBe('Survey field');
  expect(o.radius).toBe(50);
  expect(mockDb.notes[0].message).toMatch(/at Survey field \(practical\)/);
});

test('TC-UNIT-116: a practical with no place or radius gets 30 m and tells students the tutor will say where', async () => {
  await book({ sessionType: 'practical' });
  expect(mockDb.changes[0].radiusM).toBe(30);
  expect(mockDb.changes[0].place).toBeNull();
  expect(mockDb.notes[0].message).toMatch(/your tutor will tell you where/);
});

test('TC-UNIT-117: a theory class keeps its room and has no place or radius', async () => {
  await book({ sessionType: 'theory', room: 'R5', place: 'ignored', radius: 50 });
  const saved = mockDb.changes[0];
  expect(saved.roomId).toBe('R5');
  expect(saved.place).toBeNull();
  expect(saved.radiusM).toBeNull();
  expect(mockDb.notes[0].message).toMatch(/in IT-05/);
});

test('TC-UNIT-118: bad input - the radius must be 5–500 m', () => {
  const body = (radius) => ({ type: 'extra', module: 'M1', date: DAY, start: '14:00', end: '15:00', sessionType: 'practical', reason: 'extra_lecture', radius });
  expect(createSchema.safeParse(body(4)).success).toBe(false);
  expect(createSchema.safeParse(body(501)).success).toBe(false);
  expect(createSchema.safeParse(body(500)).success).toBe(true);
  expect(createSchema.safeParse(body('')).success).toBe(true); // left empty: the default is used
});
