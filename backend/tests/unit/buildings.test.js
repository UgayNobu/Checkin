const { roomKey, buildingForRoom } = require('../../src/config/buildings');

describe('roomKey', () => {
  test('TC-UNIT-19: "itl-6", "ITL 06" and "ITL6" give the same key', () => {
    expect(roomKey('itl-6')).toBe('ITL|6');
    expect(roomKey('ITL 06')).toBe('ITL|6');
    expect(roomKey('ITL6')).toBe('ITL|6');
  });

  test('TC-UNIT-20: edge case - "Drawing Studio 2" and "DS2" give the same key', () => {
    expect(roomKey('Drawing Studio 2')).toBe(roomKey('DS2'));
  });

  test('TC-UNIT-21: bad input - an unknown room name or null returns null', () => {
    expect(roomKey('Room X')).toBeNull();
    expect(roomKey(null)).toBeNull();
  });
});

describe('buildingForRoom', () => {
  test('TC-UNIT-22: rooms map to the right building', () => {
    expect(buildingForRoom('ITL 06').key).toBe('IT');
    expect(buildingForRoom('LT-01').key).toBe('LT');
    expect(buildingForRoom('CR3').key).toBe('ACAD');
    expect(buildingForRoom('CR 15').key).toBe('ARCH');
  });

  test('TC-UNIT-23: edge case - a lab name ("Data Science Lab") finds its building', () => {
    expect(buildingForRoom('Data Science Lab').key).toBe('IT');
  });

  test('TC-UNIT-24: bad input - an unknown room or empty text returns null', () => {
    expect(buildingForRoom('XYZ 99')).toBeNull();
    expect(buildingForRoom('')).toBeNull();
    expect(buildingForRoom(undefined)).toBeNull();
  });
});
