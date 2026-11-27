// Fixes from the 27 Nov review with the supervisor: the RUB 80% rule for approved leave,
// offline check-ins, old notifications expiring, management being told about evidence,
// and the timetable upload.
const mockDb = { deleted: null, users: [], notes: [], slots: null };
jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    notification: {
      deleteMany: async (q) => { mockDb.deleted = q; return { count: 3 }; },
      create: async ({ data }) => { mockDb.notes.push(data); return data; },
    },
    user: {
      findMany: async ({ where }) => mockDb.users.filter((u) => u.role === where.role && u.isActive),
      findUnique: async () => null,
    },
    academicSession: { findUnique: async ({ where }) => (where.code === 'SS2027' ? { code: 'SS2027', name: 'Spring Semester 2027' } : null) },
    program: { findMany: async () => [{ id: 'P01', name: 'B.E. Software Engineering' }] },
    module: { findMany: async () => [{ id: 'M01', code: 'DBS201' }, { id: 'M02', code: 'NET202' }] },
    room: { findMany: async () => [{ id: 'R01', name: 'IT-02' }] },
    timetableSlot: { count: async () => 0 },
  },
}));
const { standing } = require('../../src/services/stats.service');
const { savedOfflineInTime } = require('../../src/services/checkin.service');
const { pruneOld, notifyRole } = require('../../src/services/notifications.service');
const { preview, minutesOf } = require('../../src/services/timetableImport.service');
const { apiStatus } = require('../../src/utils/format');
const { env } = require('../../src/config/env');

describe('RUB attendance rule: 90%, or 80% with approved leave', () => {
  test('TC-UNIT-130: 85% with approved medical/official leave is covered, not below the requirement', () => {
    expect(standing(85, true)).toMatchObject({ covered: true, belowRequired: false, atRisk: false });
  });
  test('TC-UNIT-131: 85% without approved leave is below the 90% requirement', () => {
    expect(standing(85, false)).toMatchObject({ covered: false, belowRequired: true, atRisk: false });
  });
  test('TC-UNIT-132: under 80% is at risk even with approved leave; 90% or more is fine', () => {
    expect(standing(75, true)).toMatchObject({ covered: false, belowRequired: true, atRisk: true });
    expect(standing(92, false)).toMatchObject({ covered: false, belowRequired: false, atRisk: false });
    expect(standing(null, true)).toMatchObject({ covered: false, belowRequired: false });
  });
  test('TC-UNIT-133: an approved-leave record shows as "excused", not present', () => {
    expect(apiStatus('Excused')).toBe('excused');
    expect(apiStatus('Present')).toBe('present');
  });
});

describe('check-in saved on the phone with no internet', () => {
  const start = new Date('2026-11-27T03:00:00Z'); // 9:00 in Bhutan
  const row = { expiryTimestamp: new Date(start.getTime() + 2 * 60_000), session: { startTime: start, date: start, duration: 60 } };
  const at = (min) => new Date(start.getTime() + min * 60_000);
  test('TC-UNIT-134: saved while the code was valid and sent before the class ends: accepted', () => {
    expect(savedOfflineInTime(row, at(1).toISOString(), at(40))).toBe(true);
  });
  test('TC-UNIT-135: saved after the code expired, or sent after the class ended: refused', () => {
    expect(savedOfflineInTime(row, at(3).toISOString(), at(10))).toBe(false);
    expect(savedOfflineInTime(row, at(1).toISOString(), at(90))).toBe(false);
  });
  test('TC-UNIT-136: a "saved" time in the future or missing is refused', () => {
    expect(savedOfflineInTime(row, at(30).toISOString(), at(10))).toBe(false);
    expect(savedOfflineInTime(row, undefined, at(10))).toBe(false);
  });
});

describe('notifications', () => {
  test('TC-UNIT-137: read notifications expire after 30 days, unread ones after 90', async () => {
    const now = new Date('2026-12-31T00:00:00Z');
    expect(await pruneOld(now)).toBe(3);
    const [read, any] = mockDb.deleted.where.OR;
    expect(read.isRead).toBe(true);
    expect(now - read.createdAt.lt).toBe(env.notifyKeepReadDays * 86400000);
    expect(now - any.createdAt.lt).toBe(env.notifyKeepDays * 86400000);
    expect(env.notifyKeepReadDays).toBe(30);
    expect(env.notifyKeepDays).toBe(90);
  });
  test('TC-UNIT-138: a role-wide message reaches every active management account (bell)', async () => {
    mockDb.users = [{ id: 'M1', role: 'management', isActive: true }, { id: 'M2', role: 'management', isActive: false }, { id: 'T1', role: 'tutor', isActive: true }];
    mockDb.notes = [];
    await notifyRole('management', 'New absence request', 'Evidence Documents');
    expect(mockDb.notes.map((n) => n.userId)).toEqual(['M1']);
  });
});

describe('timetable upload', () => {
  test('TC-UNIT-139: times in 24-hour and 12-hour form are read', () => {
    expect(minutesOf('9:00')).toBe(540);
    expect(minutesOf('1:15 PM')).toBe(795);
    expect(minutesOf('12:00 AM')).toBe(0);
    expect(minutesOf('25:00')).toBeNull();
  });
  test('TC-UNIT-140: the preview lists every problem with its row number and saves nothing', async () => {
    const r = await preview('SS2027', [
      { programme: 'Software Engineering', year: '2', day: 'Mon', start: '9:00', end: '10:00', module: 'DBS201', room: 'IT 02' },
      { programme: 'B.E. Software Engineering', year: '2', day: 'Monday', start: '9:30', end: '10:30', module: 'NET202', room: 'IT-02' },
      { programme: 'Nope', year: '2', day: 'Funday', start: '10:00', end: '9:00', module: 'XXX' },
    ]);
    expect(r.ok).toBe(false);
    expect(r.count).toBe(1);
    expect(r.errors).toContainEqual({ row: 3, message: 'IT-02 is already used at that time by row 2.' });
    expect(r.errors.filter((e) => e.row === 4).length).toBeGreaterThanOrEqual(3);
  });
});
