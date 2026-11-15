// One phone per check-in (ONE_DEVICE_CHECK): a second student checking in from the same
// phone in the same session is flagged. The database and notifications are fakes.
process.env.JWT_SECRET = 'test-secret';

const mockSaved = []; // attendance rows the fake database holds
jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    attendanceCode: {
      findFirst: jest.fn(async () => ({
        code: 'ABC234', sessionId: 'S1', expiryTimestamp: new Date(Date.now() + 60_000), geofenceRadius: 40,
        latitude: 27.0, longitude: 89.0, // a workshop circle around the tutor
        session: { status: 'ongoing', section: { tutorId: 'CST-0142', academicSession: 'AS2026', module: { id: 'M1', code: 'SWE303', name: 'Software Project Management' } } },
      })),
    },
    enrollment: { findUnique: jest.fn(async () => ({ id: 'E1' })) },
    attendance: {
      findFirst: jest.fn(async ({ where }) => mockSaved.find((a) => a.sessionId === where.sessionId && a.deviceId === where.deviceId && a.studentId !== where.studentId.not) || null),
      create: jest.fn(async ({ data }) => { mockSaved.push(data); return data; }),
    },
  },
}));
jest.mock('../../src/services/notifications.service', () => ({ notify: jest.fn(async () => {}) }));
jest.mock('../../src/services/session.service', () => ({ locationOf: () => null }));

const load = (on) => {
  jest.resetModules();
  process.env.ONE_DEVICE_CHECK = on ? 'on' : 'off';
  return require('../../src/services/checkin.service');
};
const here = { code: 'ABC234', lat: 27.0, lng: 89.0, accuracy: 10 };
const PHONE = 'phone-1234-abcd';

beforeEach(() => { mockSaved.length = 0; });

describe('one phone per check-in', () => {
  test('TC-UNIT-75: the first student on a phone is marked present, and the phone is saved', async () => {
    const { checkIn } = load(true);
    const r = await checkIn({ id: '02250001', name: 'A' }, { ...here, deviceId: PHONE });
    expect(r.status).toBe('present');
    expect(mockSaved[0].deviceId).toBe(PHONE);
  });

  test('TC-UNIT-76: a second student on the same phone in the same session is flagged, naming the first', async () => {
    const { checkIn } = load(true);
    await checkIn({ id: '02250001', name: 'A' }, { ...here, deviceId: PHONE });
    const r = await checkIn({ id: '02250002', name: 'B' }, { ...here, deviceId: PHONE });
    expect(r.status).toBe('flagged');
    expect(mockSaved[1].flagReason).toBe('shared_device - 02250001');
    expect(r.message).toMatch(/another student already checked in from this phone/);
  });

  test('TC-UNIT-77: edge case - with the switch off (testing), the same phone is not flagged', async () => {
    const { checkIn } = load(false);
    await checkIn({ id: '02250001', name: 'A' }, { ...here, deviceId: PHONE });
    const r = await checkIn({ id: '02250002', name: 'B' }, { ...here, deviceId: PHONE });
    expect(r.status).toBe('present');
  });

  test('TC-UNIT-78: different phones are both present', async () => {
    const { checkIn } = load(true);
    await checkIn({ id: '02250001', name: 'A' }, { ...here, deviceId: PHONE });
    const r = await checkIn({ id: '02250002', name: 'B' }, { ...here, deviceId: 'phone-9999-zzzz' });
    expect(r.status).toBe('present');
  });

  test('TC-UNIT-79: bad input - a check-in without a device ID still works (e.g. private mode)', async () => {
    const { checkIn } = load(true);
    const r = await checkIn({ id: '02250003', name: 'C' }, { ...here });
    expect(r.status).toBe('present');
  });
});

describe('flag text for tutors', () => {
  const { flagText } = require('../../src/utils/format');
  test('TC-UNIT-80: the shared-phone reason names the other student; other reasons are unchanged', () => {
    expect(flagText('shared_device - 02250001')).toBe('Same phone as another student (02250001)');
    expect(flagText('low_accuracy')).toBe('Weak GPS accuracy');
  });
});
