import { describe as group, test, expect } from 'vitest';
import { placeOptions, PLACES } from '../pages/shared/PlacePicker.jsx';
import { classState } from '../pages/teacher/Dashboard.jsx';

group('practical place list', () => {
  test('TC-UNIT-125: places used before come first, then the common campus places, without repeats', () => {
    const l = placeOptions('', ['Football Ground', 'Behind the hostel']);
    expect(l.slice(0, 2).map((x) => x.p)).toEqual(['Football Ground', 'Behind the hostel']);
    expect(l.filter((x) => x.p.toLowerCase() === 'football ground')).toHaveLength(1);
    expect(l).toHaveLength(PLACES.length + 1);
  });
  test('TC-UNIT-126: typing filters the list (any part of the name, any case)', () => {
    expect(placeOptions('LAB', []).map((x) => x.p)).toEqual(PLACES.filter((p) => /lab/i.test(p)));
    expect(placeOptions('xyz', [])).toEqual([]);
  });
});

group('tutor dashboard: today\'s classes', () => {
  const cls = (start, end, status) => ({ start, end, session: status ? { status } : null });
  test('TC-UNIT-127: each class shows where it stands right now', () => {
    expect(classState(cls('09:00', '10:00', 'ongoing'), '09:30')[0]).toBe('live');
    expect(classState(cls('09:00', '10:00', 'ended'), '11:00')[0]).toBe('taken');
    expect(classState(cls('09:00', '10:00'), '11:00')[0]).toBe('past');
    expect(classState(cls('09:00', '10:00'), '09:15')[0]).toBe('now');
    expect(classState(cls('14:00', '15:00'), '09:15')[0]).toBe('next');
  });
});
