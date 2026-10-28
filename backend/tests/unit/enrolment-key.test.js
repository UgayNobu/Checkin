const { normalizeEnrolmentKey } = require('../../src/utils/enrolment-key');

describe('normalizeEnrolmentKey', () => {
  test('TC-UNIT-25: spaces are trimmed and letters made capital', () => {
    expect(normalizeEnrolmentKey('  ide201-3-t1-k7q  ')).toBe('IDE201-3-T1-K7Q');
  });

  test('TC-UNIT-26: edge case - a key that is already clean is unchanged', () => {
    expect(normalizeEnrolmentKey('CSF101-K7Q')).toBe('CSF101-K7Q');
  });

  test('TC-UNIT-27: bad input - null and undefined become an empty string', () => {
    expect(normalizeEnrolmentKey(null)).toBe('');
    expect(normalizeEnrolmentKey(undefined)).toBe('');
  });
});
