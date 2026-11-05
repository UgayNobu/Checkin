import { describe, test, expect } from 'vitest';
import { placeStatus, outsideBuilding, metresBetween } from '../geofence';

// A square "building" about 100 m across: lng 89.000–89.001, lat 27.000–27.0009
const ring = [[89.0, 27.0], [89.001, 27.0], [89.001, 27.0009], [89.0, 27.0009], [89.0, 27.0]];
const bld = { mode: 'building', building: 'IT', name: 'IT Building', edge: 10 };
const ws = { mode: 'workshop', radius: 40, edge: 40, centre: { lat: 27.0, lng: 89.0 } };
const M_LAT = 1 / 111320; // degrees of latitude per metre

describe('Check-in location status (geofence.js)', () => {
  test('TC-UNIT-61: valid input - phone inside the building with good GPS shows green', () => {
    const s = placeStatus({ lat: 27.00045, lng: 89.0005, accuracy: 12 }, bld, [ring]);
    expect(s.level).toBe('good');
    expect(s.text).toMatch(/inside the IT Building/);
  });

  test('TC-UNIT-62: invalid input - phone 200 m outside the building shows red, not green', () => {
    const s = placeStatus({ lat: 27.0009 + 200 * M_LAT, lng: 89.0005, accuracy: 15 }, bld, [ring]);
    expect(s.level).toBe('bad');
    expect(s.text).toMatch(/about 200 m outside/);
  });

  test('TC-UNIT-63: edge case - just outside, but the GPS error could put them inside, shows yellow', () => {
    const s = placeStatus({ lat: 27.0009 + 25 * M_LAT, lng: 89.0005, accuracy: 30 }, bld, [ring]);
    expect(s.level).toBe('weak');
  });

  test('TC-UNIT-64: edge case - inside but with weak GPS (±80 m) shows yellow', () => {
    const s = placeStatus({ lat: 27.00045, lng: 89.0005, accuracy: 80 }, bld, [ring]);
    expect(s.level).toBe('weak');
  });

  test('TC-UNIT-65: workshop - within the radius is green, 120 m away is red', () => {
    expect(placeStatus({ lat: 27.0 + 20 * M_LAT, lng: 89.0, accuracy: 10 }, ws).level).toBe('good');
    expect(placeStatus({ lat: 27.0 + 120 * M_LAT, lng: 89.0, accuracy: 10 }, ws).level).toBe('bad');
  });

  test('TC-UNIT-66: helpers - inside a building is 0 m outside; 100 m north is about 100 m away', () => {
    expect(outsideBuilding({ lat: 27.00045, lng: 89.0005 }, [ring])).toBe(0);
    expect(Math.round(metresBetween({ lat: 27, lng: 89 }, { lat: 27 + 100 * M_LAT, lng: 89 }))).toBe(100);
  });

  test('TC-UNIT-67: no location or no outline yet - returns null so the "finding your location" line stays', () => {
    expect(placeStatus(null, bld, [ring])).toBeNull();
    expect(placeStatus({ lat: 27, lng: 89, accuracy: 10 }, bld, [])).toBeNull();
    expect(placeStatus({ lat: 27, lng: 89, accuracy: 10 }, { mode: 'workshop', edge: 40 })).toBeNull();
  });
});
