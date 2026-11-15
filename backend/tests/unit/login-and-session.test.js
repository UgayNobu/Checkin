// Login messages and logging out removed / deactivated accounts.
// The database is replaced with a fake, so nothing real is touched.
process.env.JWT_SECRET = 'test-secret';

const mockUsers = new Map(); // id → user row the fake database returns
jest.mock('../../src/lib/prisma', () => ({
  prisma: { user: { findUnique: jest.fn(async ({ where }) => mockUsers.get(where.id) ?? null) } },
}));

const { hashPassword } = require('../../src/utils/password');
const { signAuthToken } = require('../../src/utils/jwt');
const userCache = require('../../src/utils/userCache');
const { requireAuth } = require('../../src/middleware/requireAuth');
const { login } = require('../../src/services/auth.service');

const student = async (over = {}) => ({
  id: '02250001', name: 'Test Student', email: '02250001.cst@rub.edu.bt', role: 'student',
  isActive: true, status: 'active', passwordHash: await hashPassword('Cst@2026'), ...over,
});

/** Runs requireAuth for a request with this token; resolves to the error it passed on, or null. */
const run = (token) => new Promise((resolve) => {
  requireAuth({ headers: { authorization: 'Bearer ' + token }, cookies: {} }, {}, (err) => resolve(err || null));
});

beforeEach(() => { mockUsers.clear(); userCache.clear(); });

describe('login messages', () => {
  test('TC-UNIT-68: an ID with no account says the account was not found', async () => {
    await expect(login({ userId: '02259999', password: 'Cst@2026' })).rejects.toMatchObject({ status: 401, code: 'ACCOUNT_NOT_FOUND' });
  });

  test('TC-UNIT-69: a wrong password says the password is wrong, not "wrong ID or password"', async () => {
    mockUsers.set('02250001', await student());
    await expect(login({ userId: '02250001', password: 'Wrong@2026' })).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
  });

  test('TC-UNIT-70: edge case - a deactivated account with the right password is told it was deactivated', async () => {
    mockUsers.set('02250001', await student({ isActive: false, status: 'inactive' }));
    await expect(login({ userId: '02250001', password: 'Cst@2026' })).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_NOT_ACTIVE' });
  });
});

describe('logged-in account removed or deactivated', () => {
  test('TC-UNIT-71: an active account passes', async () => {
    mockUsers.set('02250001', await student());
    expect(await run(signAuthToken({ id: '02250001', role: 'student' }))).toBeNull();
  });

  test('TC-UNIT-72: a removed account is logged out with ACCOUNT_REMOVED', async () => {
    const err = await run(signAuthToken({ id: '02250001', role: 'student' })); // valid token, no user any more
    expect(err).toMatchObject({ status: 401, code: 'ACCOUNT_REMOVED' });
  });

  test('TC-UNIT-73: a deactivated account is logged out with ACCOUNT_NOT_ACTIVE', async () => {
    mockUsers.set('02250001', await student({ isActive: false }));
    const err = await run(signAuthToken({ id: '02250001', role: 'student' }));
    expect(err).toMatchObject({ status: 401, code: 'ACCOUNT_NOT_ACTIVE' });
    expect(err.message).toMatch(/deactivated by the admin/);
  });

  test('TC-UNIT-74: bad input - a forged token is just "Please log in", with no account message', async () => {
    const err = await run('not-a-real-token');
    expect(err).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
  });
});
