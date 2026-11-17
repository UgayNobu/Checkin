// Swapping classes between two tutors (swap.service.js), with an in-memory database.
// A: SWE303 Mondays 9:00–10:00 in IT-02 (tutor A). B: CTE202 Mondays 11:15–12:15 in IT-05 (tutor B).
const MON = '2099-01-05'; // a Monday far ahead, so it is never "already started"
const mockDb = {};
const reset = () => Object.assign(mockDb, {
  slots: [
    { id: 'TS1', academicSession: 'AS', dayOfWeek: 1, moduleId: 'M1', module: { code: 'SWE303', name: 'Project Management' }, roomId: 'R2', room: { id: 'R2', name: 'IT-02' }, startTime: new Date('1970-01-01T09:00:00Z'), endTime: new Date('1970-01-01T10:00:00Z'), sessionType: 'theory', programId: 'P1', year: 3, program: { name: 'B.E. Software Engineering' } },
    { id: 'TS2', academicSession: 'AS', dayOfWeek: 1, moduleId: 'M2', module: { code: 'CTE202', name: 'Data Structures' }, roomId: 'R5', room: { id: 'R5', name: 'IT-05' }, startTime: new Date('1970-01-01T11:15:00Z'), endTime: new Date('1970-01-01T12:15:00Z'), sessionType: 'theory', programId: 'P2', year: 2, program: { name: 'B.E. Information Technology' } },
  ],
  sections: [{ id: 'S1', moduleId: 'M1', tutorId: 'TA', tutor: { name: 'Tutor A' } }, { id: 'S2', moduleId: 'M2', tutorId: 'TB', tutor: { name: 'Tutor B' } }],
  users: { TA: { id: 'TA', name: 'Tutor A', role: 'tutor', isActive: true }, TB: { id: 'TB', name: 'Tutor B', role: 'tutor', isActive: true } },
  swaps: [], changes: [], notes: [],
});
const ymdOf = (d) => d.toISOString().slice(0, 10);

jest.mock('../../src/lib/academicSession', () => ({ currentAcademicSession: async () => 'AS' }));
jest.mock('../../src/services/notifications.service', () => ({
  notify: async (userId, message) => { mockDb.notes.push({ userId, message }); },
}));
jest.mock('../../src/lib/prisma', () => {
  const slotsOn = (where) => mockDb.slots.filter((s) => (where?.dayOfWeek == null || s.dayOfWeek === where.dayOfWeek));
  const prisma = {
    academicSession: { findUnique: async () => null },
    section: { findMany: async () => mockDb.sections },
    timetableSlot: {
      findMany: async ({ where } = {}) => slotsOn(where),
      findUnique: async ({ where }) => mockDb.slots.find((s) => s.id === where.id) || null,
    },
    classChange: {
      findMany: async () => [],
      findFirst: async ({ where }) => mockDb.changes.find((c) => c.slotId === where.slotId && ymdOf(c.date) === ymdOf(where.date)) || null,
      create: async ({ data }) => { const c = { id: `CC${mockDb.changes.length + 1}`, ...data }; mockDb.changes.push(c); return c; },
      findUnique: async ({ where }) => mockDb.changes.find((c) => c.id === where.id) || null,
      update: async ({ where, data }) => Object.assign(mockDb.changes.find((c) => c.id === where.id), data),
    },
    classSession: { findMany: async () => [], findFirst: async () => null },
    module: { findUnique: async () => ({ programId: 'P1', year: 3 }) },
    enrollment: { findMany: async () => [], groupBy: async () => [] },
    room: { findMany: async () => [] },
    user: { findUnique: async ({ where }) => mockDb.users[where.id] || null },
    swapRequest: {
      findFirst: async ({ where }) => mockDb.swaps.find((s) => s.status === where.status) || null,
      findUnique: async ({ where }) => {
        const s = mockDb.swaps.find((x) => x.id === where.id);
        return s && { ...s, fromTutor: mockDb.users[s.fromTutorId], toTutor: mockDb.users[s.toTutorId] };
      },
      create: async ({ data }) => { const s = { id: `SW${mockDb.swaps.length + 1}`, status: 'pending', createdAt: new Date(), ...data }; mockDb.swaps.push(s); return s; },
      update: async ({ where, data }) => Object.assign(mockDb.swaps.find((x) => x.id === where.id), data),
    },
    notification: { createMany: async () => ({}) },
  };
  prisma.$transaction = async (ops) => Promise.all(ops);
  return { prisma };
});

const swaps = require('../../src/services/swap.service');
const ask = (extra = {}) => swaps.request('TA', { slot: 'TS1', date: MON, withTutor: 'TB', withSlot: 'TS2', withDate: MON, ...extra });

beforeEach(reset);

test('TC-UNIT-108: asking for a swap changes nothing yet and sends tutor B a notification', async () => {
  const r = await ask();
  expect(r.status).toBe('pending');
  expect(mockDb.changes).toHaveLength(0);
  expect(mockDb.notes.find((n) => n.userId === 'TB').message).toMatch(/wants to swap classes.*accept or reject/);
});

test('TC-UNIT-109: when B accepts, the two classes exchange time and room', async () => {
  const r = await ask();
  await swaps.accept('TB', r.id);
  const extras = mockDb.changes.filter((c) => c.type === 'extra');
  const cancelled = mockDb.changes.filter((c) => c.type === 'cancelled');
  expect(cancelled.map((c) => c.slotId).sort()).toEqual(['TS1', 'TS2']);
  const swe = extras.find((c) => c.moduleId === 'M1'), cte = extras.find((c) => c.moduleId === 'M2');
  expect(swe.startTime.toISOString().slice(11, 16)).toBe('11:15'); // SWE303 moves to B's time …
  expect(swe.roomId).toBe('R5'); // … and room
  expect(cte.startTime.toISOString().slice(11, 16)).toBe('09:00');
  expect(mockDb.swaps[0].status).toBe('accepted');
  expect(mockDb.notes.find((n) => n.userId === 'TA').message).toMatch(/accepted your swap/);
});

test('TC-UNIT-110: bad input - only tutor B can accept, and a rejected swap changes nothing', async () => {
  const r = await ask();
  await expect(swaps.accept('TA', r.id)).rejects.toMatchObject({ code: 'NOT_YOURS' });
  await swaps.reject('TB', r.id);
  expect(mockDb.changes).toHaveLength(0);
  expect(mockDb.notes.find((n) => n.userId === 'TA').message).toMatch(/rejected your swap/);
  await expect(swaps.accept('TB', r.id)).rejects.toMatchObject({ code: 'SWAP_DONE' });
});

test('TC-UNIT-111: edge case - you can only offer your own module, and only to another tutor', async () => {
  await expect(swaps.request('TB', { slot: 'TS1', date: MON, withTutor: 'TA', withSlot: 'TS2', withDate: MON })).rejects.toMatchObject({ code: 'NOT_YOUR_MODULE' });
  await expect(ask({ withTutor: 'TA' })).rejects.toMatchObject({ code: 'BAD_SWAP' });
  await expect(ask({ date: '2099-01-06' })).rejects.toMatchObject({ code: 'WRONG_DAY' }); // TS1 is on Mondays
});

test('TC-UNIT-112: a booked extra class can be swapped too: it simply moves', async () => {
  // B has an extra CTE202 class on Monday 2:00–3:00 PM, no room
  mockDb.changes.push({ id: 'CCX', type: 'extra', date: new Date(`${MON}T00:00:00Z`), moduleId: 'M2', module: { code: 'CTE202', name: 'Data Structures' },
    roomId: null, room: null, startTime: new Date('1970-01-01T14:00:00Z'), endTime: new Date('1970-01-01T15:00:00Z'), sessionType: 'theory', counts: true });
  const r = await swaps.request('TA', { slot: 'TS1', date: MON, withTutor: 'TB', withChange: 'CCX' });
  await swaps.accept('TB', r.id);
  const moved = mockDb.changes.find((c) => c.id === 'CCX');
  expect(moved.startTime.toISOString().slice(11, 16)).toBe('09:00'); // CTE202 extra class moves to SWE303's time …
  expect(moved.roomId).toBe('R2'); // … and room
  const swe = mockDb.changes.find((c) => c.type === 'extra' && c.moduleId === 'M1');
  expect(swe.startTime.toISOString().slice(11, 16)).toBe('14:00'); // SWE303 gets the extra class's time
  expect(mockDb.changes.filter((c) => c.type === 'cancelled').map((c) => c.slotId)).toEqual(['TS1']);
});
