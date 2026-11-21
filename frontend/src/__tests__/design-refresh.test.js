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

group('tutor dashboard: booked classes show up', () => {
  test('TC-UNIT-128: extra classes and covers booked for today are listed; cancelled or given-away classes are marked', async () => {
    const { todaysClasses } = await import('../pages/teacher/Dashboard.jsx');
    const mod = { id: 'M1', code: 'SWE302', name: 'Testing' };
    const slots = [
      { id: 'TS1', isToday: true, teaches: true, start: '09:00', end: '10:00', module: mod },
      { id: 'TS2', isToday: true, teaches: true, start: '11:00', end: '12:00', module: mod },
      { id: 'TS3', isToday: false, teaches: true, start: '09:00', end: '10:00', module: mod },
    ];
    const changes = [
      { id: 'CC1', type: 'extra', date: '2026-11-21', start: '14:00', end: '15:00', module: mod, sessionType: 'practical', place: 'Survey Field', counts: true },
      { id: 'CC2', type: 'cancelled', date: '2026-11-21', slotId: 'TS1', start: '09:00', end: '10:00', module: mod },
      { id: 'CC3', type: 'cover', date: '2026-11-21', slotId: 'TS9', start: '16:00', end: '17:00', module: { id: 'M9', code: 'CTE202' }, coverTutor: { id: 'T1' } },
      { id: 'CC4', type: 'extra', date: '2026-11-20', start: '14:00', end: '15:00', module: mod },
      { id: 'CC5', type: 'extra', date: '2026-11-21', start: '13:00', end: '14:00', module: { id: 'M7', code: 'X' } },
    ];
    const l = todaysClasses(slots, changes, { today: '2026-11-21', myId: 'T1', myModules: new Set(['M1']) });
    expect(l.map((x) => x.key)).toEqual(['TS1', 'TS2', 'CC1', 'CC3']);
    expect(l[0].note).toEqual(['off', 'Cancelled']);
    expect(l[2].link).toBe('/start?change=CC1');
    expect(l[3].link).toBe('/start?change=CC3');
  });
});
