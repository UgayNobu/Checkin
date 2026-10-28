const { hashPassword, verifyPassword } = require('../../src/utils/password');

describe('hashPassword / verifyPassword', () => {
  let hash;
  beforeAll(async () => {
    hash = await hashPassword('Cst@2026');
  });

  test('TC-UNIT-28: the hash is a bcrypt hash, not the plain password', () => {
    expect(hash).not.toBe('Cst@2026');
    expect(hash).toMatch(/^\$2[aby]\$10\$.{53}$/);
  });

  test('TC-UNIT-29: the right password verifies', async () => {
    await expect(verifyPassword('Cst@2026', hash)).resolves.toBe(true);
  });

  test('TC-UNIT-30: a wrong password (even one letter in a different case) does not verify', async () => {
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
    await expect(verifyPassword('cst@2026', hash)).resolves.toBe(false);
  });

  test('TC-UNIT-31: edge case - the same password hashed twice gives different hashes (salted), both verify', async () => {
    const hash2 = await hashPassword('Cst@2026');
    expect(hash2).not.toBe(hash);
    await expect(verifyPassword('Cst@2026', hash2)).resolves.toBe(true);
  });

  test('TC-UNIT-32: bad input - empty or missing password/hash returns false instead of crashing', async () => {
    await expect(verifyPassword('', hash)).resolves.toBe(false);
    await expect(verifyPassword(undefined, hash)).resolves.toBe(false);
    await expect(verifyPassword('Cst@2026', null)).resolves.toBe(false);
  });
});
