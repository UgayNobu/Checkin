const { mostCommonYear } = require('../../src/utils/year');

describe('mostCommonYear (a student\'s year from the modules they joined)', () => {
  test('TC-UNIT-58: three Year 2 modules and one Year 1 repeat module give Year 2', () => {
    expect(mostCommonYear([2, 2, 1, 2])).toBe(2);
  });
  test('TC-UNIT-59: edge case - a tie goes to the higher year (repeat modules are usually lower)', () => {
    expect(mostCommonYear([1, 2])).toBe(2);
    expect(mostCommonYear([3, 3, 2, 2])).toBe(3);
  });
  test('TC-UNIT-60: bad input - no modules gives null, so the profile year is used instead', () => {
    expect(mostCommonYear([])).toBeNull();
  });
});
