// After a counted class is closed, students marked absent are told (once). Optional classes send nothing.
const mockDb = {};
const mockSent = [];
jest.mock('../../src/services/notifications.service', () => ({ notify: async (userId, message, cat, opts) => { mockSent.push({ userId, message, opts }); } }));
jest.mock('../../src/services/classChange.service', () => ({ planStart: jest.fn() }));
jest.mock('../../src/lib/prisma', () => {
  const tx = {
    classSession: { updateMany: async ({ where }) => { if (mockDb.session.status === 'ended') return { count: 0 }; mockDb.session.status = 'ended'; return { count: 1 }; } },
    attendance: {
      createMany: async ({ data }) => { data.forEach((d) => { if (!mockDb.att.some((a) => a.studentId === d.studentId)) mockDb.att.push({ ...d }); }); },
      updateMany: async () => ({}),
    },
  };
  return {
    prisma: {
      classSession: { findUnique: async () => ({ ...mockDb.session, ...(mockDb.staleRead && { status: 'ongoing' }) }) },
      enrollment: { findMany: async () => mockDb.enrolled.map((studentId) => ({ studentId })) },
      attendance: {
        findMany: async ({ where }) => mockDb.att.filter((a) => !where.status || a.status === where.status),
      },
      $transaction: async (fn) => fn(tx),
    },
  };
});
const { finalizeSession } = require('../../src/services/session.service');

const setup = (counts) => {
  mockSent.length = 0;
  Object.assign(mockDb, {
    session: { id: 'CS1', status: 'ongoing', counts, date: new Date('2026-11-17T00:00:00Z'), startTime: new Date('1970-01-01T07:00:00Z'),
      section: { moduleId: 'M1', academicSession: 'AS', module: { code: 'SWE303', name: 'Software Project Management' } } },
    enrolled: ['S1', 'S2', 'S3'],
    att: [{ studentId: 'S1', status: 'Present' }],
  });
};

test('TC-UNIT-113: after a counted class closes, only the students marked absent are told, by bell and email', async () => {
  setup(true);
  await finalizeSession('CS1');
  expect(mockSent.map((m) => m.userId).sort()).toEqual(['S2', 'S3']);
  expect(mockSent[0].message).toMatch(/marked absent in SWE303.*1:00 PM/); // 07:00 UTC = 1:00 PM in Bhutan
  expect(mockSent[0].opts.email).toBe('Missed class: SWE303');
});

test('TC-UNIT-114: edge case - closing twice tells nobody twice, and optional classes send nothing', async () => {
  setup(true);
  await finalizeSession('CS1');
  mockDb.staleRead = true; // a second caller (the minute sweep) that read the session before it was closed
  await finalizeSession('CS1');
  mockDb.staleRead = false;
  expect(mockSent).toHaveLength(2);
  setup(false);
  await finalizeSession('CS1');
  expect(mockSent).toHaveLength(0);
});
