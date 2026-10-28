const { haversineMeters, isWithinGeofence } = require('../../src/utils/haversine');

const p = { lat: 26.85, lng: 89.39 };

describe('haversineMeters', () => {
  test('TC-UNIT-01: same point is 0 m apart', () => {
    expect(haversineMeters(p, p)).toBe(0);
  });

  test('TC-UNIT-02: 0.001 degrees of latitude is about 111.19 m (within 1 m)', () => {
    const d = haversineMeters(p, { lat: 26.851, lng: 89.39 });
    expect(Math.abs(d - 111.19)).toBeLessThan(1);
    // distance is the same in both directions
    expect(haversineMeters({ lat: 26.851, lng: 89.39 }, p)).toBeCloseTo(d, 9);
  });

  test('TC-UNIT-03: edge case - opposite sides of the Earth is half its circumference', () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(d).toBeCloseTo(Math.PI * 6371000, 0);
  });

  test('TC-UNIT-04: bad input - missing coordinates give NaN, not a distance', () => {
    expect(haversineMeters(p, {})).toBeNaN();
  });
});

describe('isWithinGeofence', () => {
  test('TC-UNIT-05: 111 m away is inside a 120 m radius but outside a 30 m radius', () => {
    const q = { lat: 26.851, lng: 89.39 };
    expect(isWithinGeofence(q, p, 120)).toBe(true);
    expect(isWithinGeofence(q, p, 30)).toBe(false);
  });
});
