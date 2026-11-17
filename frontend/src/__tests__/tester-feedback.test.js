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

group('booking form: times and module names', () => {
  test('TC-UNIT-119: past or back-to-front times are caught before booking; a class already running is allowed', async () => {
    const { timeProblem } = await import('../pages/shared/ClassChangeDialogs.jsx');
    const today = '2026-11-18', at = (h, m = 0) => h * 60 + m;
    expect(timeProblem({ start: '15:00', end: '14:00', date: today, today, nowMin: at(9) })).toMatch(/end after it starts/);
    expect(timeProblem({ start: '08:00', end: '09:00', date: today, today, nowMin: at(10) })).toMatch(/already passed/);
    expect(timeProblem({ start: '09:30', end: '10:30', date: today, today, nowMin: at(10) })).toBe(''); // started, not over
    expect(timeProblem({ start: '08:00', end: '09:00', date: '2026-11-19', today, nowMin: at(10) })).toBe(''); // tomorrow
  });

  test('TC-UNIT-120: modules show their programme and year', async () => {
    const { modLabel } = await import('../pages/shared/ClassChangeDialogs.jsx');
    expect(modLabel({ code: 'SUR201', name: 'Surveying', programme: 'B.E. Civil Engineering', year: 2 })).toBe('SUR201 – Surveying · Civil Engineering, Year 2');
    expect(modLabel({ code: 'X1', name: 'Test' })).toBe('X1 – Test');
  });
});
