import { describe as group, test, expect } from 'vitest';
import { fuse, describe } from '../geo';

const now = 1_000_000;
const r = (lat, lng, accuracy, ago = 0) => ({ lat, lng, accuracy, t: now - ago });

group('fuse (combining phone location readings)', () => {
  test('TC-FE-10: better readings count more in the average', () => {
    const f = fuse([r(27.0, 89.0, 10), r(27.001, 89.001, 14)], now);
    expect(f.lat).toBeGreaterThan(27.0);
    expect(f.lat).toBeLessThan(27.0005); // closer to the ±10 m reading than to the ±14 m one
    expect(f.accuracy).toBe(10); // reports the best single reading, never better
    expect(f.samples).toBe(2);
  });
  test('TC-FE-11: rough Wi-Fi/cell readings are left out once GPS is good', () => {
    const f = fuse([r(27.0, 89.0, 12), r(27.01, 89.01, 300)], now);
    expect(f.lat).toBe(27.0);
    expect(f.samples).toBe(1);
  });
  test('TC-FE-12: edge case - readings older than 12 s are ignored', () => {
    expect(fuse([r(27.0, 89.0, 8, 20000)], now)).toBeNull();
  });
  test('TC-FE-13: bad input - no readings gives null', () => {
    expect(fuse([], now)).toBeNull();
  });
});

group('describe (message shown to the user)', () => {
  test('TC-FE-14: good, weak, approximate and blocked locations get the right message', () => {
    expect(describe({ accuracy: 18 }).level).toBe('good');
    expect(describe({ accuracy: 80 }).text).toMatch(/Wi-Fi/);
    expect(describe({ accuracy: 2500 }).text).toMatch(/Precise Location/);
    expect(describe(null, { code: 1 }).level).toBe('bad');
    expect(describe(null).level).toBe('wait');
  });
});
