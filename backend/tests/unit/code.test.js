const { generateCheckInCode, normalizeCode, isValidCodeFormat, isCodeStillValid } = require('../../src/utils/code');

describe('generateCheckInCode', () => {
  test('TC-UNIT-12: 1,000 codes are all 6 characters with no 0, O, 1, I or L', () => {
    for (let i = 0; i < 1000; i++) {
      const code = generateCheckInCode();
      expect(code).toMatch(/^[A-Z2-9]{6}$/);
      expect(code).not.toMatch(/[0O1IL]/);
      expect(isValidCodeFormat(code)).toBe(true);
    }
  });

  test('TC-UNIT-13: codes are random (1,000 codes give at least 990 different ones)', () => {
    const codes = new Set(Array.from({ length: 1000 }, generateCheckInCode));
    expect(codes.size).toBeGreaterThanOrEqual(990);
  });
});

describe('normalizeCode', () => {
  test('TC-UNIT-14: " abc123 " becomes "ABC123"', () => {
    expect(normalizeCode(' abc123 ')).toBe('ABC123');
  });

  test('TC-UNIT-15: edge case - spaces inside the code are removed ("ab c 12 3")', () => {
    expect(normalizeCode('ab c 12 3')).toBe('ABC123');
  });

  test('TC-UNIT-16: bad input - null, undefined and numbers do not crash', () => {
    expect(normalizeCode(null)).toBe('');
    expect(normalizeCode(undefined)).toBe('');
    expect(normalizeCode(123456)).toBe('123456');
  });
});

describe('isValidCodeFormat', () => {
  test('TC-UNIT-17: short, long, lowercase and symbol codes are invalid', () => {
    expect(isValidCodeFormat('ABC12')).toBe(false);
    expect(isValidCodeFormat('ABC1234')).toBe(false);
    expect(isValidCodeFormat('abc123')).toBe(false);
    expect(isValidCodeFormat('ABC-12')).toBe(false);
    expect(isValidCodeFormat('')).toBe(false);
  });
});

describe('isCodeStillValid', () => {
  test('TC-UNIT-18: a code expiring in 2 minutes is valid; one that expired 10 s ago is not', () => {
    expect(isCodeStillValid(new Date(Date.now() + 2 * 60 * 1000))).toBe(true);
    expect(isCodeStillValid(new Date(Date.now() - 10 * 1000))).toBe(false);
  });
});
