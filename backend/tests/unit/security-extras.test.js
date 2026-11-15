// Same-site check for changes (CSRF) and signed, time-limited file links.
process.env.JWT_SECRET = 'test-secret';
jest.mock('../../src/lib/prisma', () => ({ prisma: {} }));

const { allowed } = require('../../src/middleware/sameOrigin');
const { signedFilePath, checkFileLink } = require('../../src/lib/storage');

const prod = { isProd: true, frontendUrls: ['https://checkin-cst-group2.vercel.app'] };
const ID = '0b9a3c4e-1f2d-4a5b-8c6d-7e8f9a0b1c2d';
const parts = (p) => Object.fromEntries(new URL('http://x' + p).searchParams);

describe('changes must come from our own site', () => {
  test('TC-UNIT-87: a POST from the CheckIn website is allowed', () => {
    expect(allowed('POST', 'https://checkin-cst-group2.vercel.app', prod)).toBe(true);
  });
  test('TC-UNIT-88: bad input - a POST or DELETE from another website is refused', () => {
    expect(allowed('POST', 'https://evil.example.com', prod)).toBe(false);
    expect(allowed('DELETE', 'https://checkin-cst-group2.vercel.app.evil.com', prod)).toBe(false);
  });
  test('TC-UNIT-89: edge case - reading (GET), tools with no Origin, and development are not blocked', () => {
    expect(allowed('GET', 'https://evil.example.com', prod)).toBe(true);
    expect(allowed('POST', undefined, prod)).toBe(true);
    expect(allowed('POST', 'http://localhost:5173', { isProd: false, frontendUrls: [] })).toBe(true);
  });
});

describe('file links run out', () => {
  test('TC-UNIT-90: a fresh link works', () => {
    const q = parts(signedFilePath(ID));
    expect(checkFileLink(ID, q.exp, q.sig)).toBe(true);
  });
  test('TC-UNIT-91: a link older than its expiry time stops working', () => {
    const q = parts(signedFilePath(ID, Date.now() - 8 * 3600e3)); // made 8 hours ago
    expect(checkFileLink(ID, q.exp, q.sig)).toBe(false);
  });
  test('TC-UNIT-92: bad input - a changed expiry, a link for another file, or no signature is refused', () => {
    const q = parts(signedFilePath(ID));
    expect(checkFileLink(ID, Number(q.exp) + 3600 * 24, q.sig)).toBe(false);
    expect(checkFileLink('ffffffff-1f2d-4a5b-8c6d-7e8f9a0b1c2d', q.exp, q.sig)).toBe(false);
    expect(checkFileLink(ID, q.exp, undefined)).toBe(false);
  });
});
