// Sign-up email check (EMAIL_VERIFY). The database and email are fakes: nothing real is touched.
process.env.JWT_SECRET = 'test-secret';

const mockDb = { users: new Map(), pending: new Map() };
const mockMail = [];
jest.mock('../../src/lib/prisma', () => {
  const ci = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }) => mockDb.users.get(where.id) ?? null),
      findFirst: jest.fn(async ({ where }) => [...mockDb.users.values()].find((u) => ci(u.email, where.email.equals)) ?? null),
      create: jest.fn(async ({ data }) => { mockDb.users.set(data.id, data); return data; }),
      update: jest.fn(async ({ where, data }) => Object.assign(mockDb.users.get(where.id), data)),
    },
    pendingSignup: {
      findUnique: jest.fn(async ({ where }) => mockDb.pending.get(where.userId) ?? null),
      upsert: jest.fn(async ({ where, create, update }) => {
        const row = mockDb.pending.has(where.userId) ? { ...mockDb.pending.get(where.userId), ...update } : create;
        mockDb.pending.set(where.userId, row); return row;
      }),
      update: jest.fn(async ({ where, data }) => {
        const row = mockDb.pending.get(where.userId);
        if (data.attempts?.increment) row.attempts += data.attempts.increment; else Object.assign(row, data);
        return row;
      }),
      delete: jest.fn(async ({ where }) => mockDb.pending.delete(where.userId)),
      deleteMany: jest.fn(async ({ where }) => {
        for (const [k, v] of mockDb.pending) if (ci(v.email, where.email.equals) && k !== where.userId.not) mockDb.pending.delete(k);
      }),
    },
  };
  prisma.$transaction = jest.fn(async (ops) => Promise.all(ops));
  return { prisma };
});
jest.mock('../../src/lib/mailer', () => ({
  isSmtpConfigured: () => true,
  explain: (e) => String(e),
  sendMail: jest.fn(async (m) => { mockMail.push(m); }),
}));
jest.mock('../../src/services/notifications.service', () => ({ notify: jest.fn(), notifyAdmins: jest.fn() }));

const load = (on) => {
  jest.resetModules();
  process.env.EMAIL_VERIFY = on ? 'on' : 'off';
  return require('../../src/services/auth.service');
};
const form = { userId: '02250368', name: 'Sanskar Gurung', email: '02250368.cst@rub.edu.bt', password: 'Cst@2026', role: 'student', programme: 'B.E. Software Engineering', year: 2 };

beforeEach(() => { mockDb.users.clear(); mockDb.pending.clear(); mockMail.length = 0; });

describe('sign-up email check', () => {
  test('TC-UNIT-81: switch off - the account is created straight away, no email', async () => {
    const auth = load(false);
    const r = await auth.register(form);
    expect(r.message).toBe('Account created');
    expect(mockDb.users.get('02250368').year).toBe(2);
    expect(mockMail).toHaveLength(0);
  });

  test('TC-UNIT-82: switch on - no account yet; a 6-digit code is emailed and the address is masked', async () => {
    const auth = load(true);
    const r = await auth.register(form);
    expect(r.verify).toBe(true);
    expect(r.email).toBe('02*****8.cst@rub.edu.bt');
    expect(mockDb.users.has('02250368')).toBe(false);
    expect(mockMail[0].to).toBe('02250368.cst@rub.edu.bt');
    expect(mockMail[0].code).toMatch(/^\d{6}$/);
  });

  test('TC-UNIT-83: the right code creates the account; the waiting sign-up is removed', async () => {
    const auth = load(true);
    await auth.register(form);
    const r = await auth.verifySignup({ userId: '02250368', code: mockMail[0].code });
    expect(r.message).toBe('Account created');
    expect(mockDb.users.get('02250368')).toMatchObject({ email: '02250368.cst@rub.edu.bt', isActive: true });
    expect(mockDb.pending.size).toBe(0);
  });

  test('TC-UNIT-84: bad input - a wrong code is refused and counted; after 5 wrong tries even the right code fails', async () => {
    const auth = load(true);
    await auth.register(form);
    const wrong = mockMail[0].code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await expect(auth.verifySignup({ userId: '02250368', code: wrong })).rejects.toMatchObject({ code: 'SIGNUP_CODE_INVALID' });
    await expect(auth.verifySignup({ userId: '02250368', code: mockMail[0].code })).rejects.toMatchObject({ code: 'SIGNUP_CODE_INVALID' });
    expect(mockDb.users.has('02250368')).toBe(false);
  });

  test('TC-UNIT-85: edge case - an unconfirmed sign-up does not block the real owner from signing up again', async () => {
    const auth = load(true);
    await auth.register({ ...form, name: 'Someone Else' });              // never confirmed
    await auth.register(form);                                            // the real student
    await auth.verifySignup({ userId: '02250368', code: mockMail[1].code });
    expect(mockDb.users.get('02250368').name).toBe('Sanskar Gurung');
  });
});

describe('maskEmail', () => {
  const { maskEmail } = load(false);
  test('TC-UNIT-86: shows enough to recognise the address but not to copy it', () => {
    expect(maskEmail('02250368.cst@rub.edu.bt')).toBe('02*****8.cst@rub.edu.bt');
    expect(maskEmail('ab@rub.edu.bt')).toBe('a**@rub.edu.bt');
    expect(maskEmail('')).toBeNull();
  });
});
