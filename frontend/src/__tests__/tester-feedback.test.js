import { describe as group, test, expect, vi } from 'vitest';
import { t12, span12 } from '../time12';

group('12-hour times', () => {
  test('TC-UNIT-106: 24-hour times are shown with AM / PM', () => {
    expect(t12('13:50')).toBe('1:50 PM');
    expect(t12('09:05')).toBe('9:05 AM');
    expect(t12('00:00')).toBe('12:00 AM');
    expect(span12('22:45', '23:45')).toBe('10:45 PM – 11:45 PM');
  });
});

group('phone location that goes quiet', () => {
  test('TC-UNIT-107: with no fresh reading, the phone is asked once directly instead of failing', async () => {
    vi.useFakeTimers();
    const getCurrentPosition = vi.fn((ok) => ok({ coords: { latitude: 26.8494, longitude: 89.3919, accuracy: 9 } }));
    // watchPosition never reports (a phone lying still)
    vi.stubGlobal('navigator', { geolocation: { watchPosition: vi.fn(() => 1), clearWatch: vi.fn(), getCurrentPosition } });
    const { bestPosition } = await import('../geo');
    const p = bestPosition({ maxWait: 1000 });
    await vi.advanceTimersByTimeAsync(1100);
    await expect(p).resolves.toEqual({ lat: 26.8494, lng: 89.3919, accuracy: 9 });
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
