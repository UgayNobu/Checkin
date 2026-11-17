// Fixes from the 17 Nov testing: programme counts, booking clashes, all-day slots, 12-hour times.
jest.mock('../../src/lib/prisma', () => ({ prisma: {} }));
const { progKey, programmeMatch } = require('../../src/utils/programme');
const { t12, dayPeriods, clashes, blocks } = require('../../src/services/classChange.service');

describe('programme names', () => {
  test('TC-UNIT-100: "B.E. Software Engineering" and "Software Engineering" count as the same programme', () => {
    expect(progKey('B.E. Software Engineering')).toBe(progKey('Software Engineering'));
    expect(progKey('BE Civil Engineering')).toBe('civil engineering');
    expect(progKey('Bachelor of Architecture')).toBe('bachelor of architecture');
  });
  test('TC-UNIT-101: the student filter matches the programme or the department, with or without "B.E."', () => {
    const f = programmeMatch('B.E. Software Engineering');
    expect(f).toContainEqual({ department: { equals: 'Software Engineering', mode: 'insensitive' } });
    expect(f).toContainEqual({ programme: { equals: 'B.E. Software Engineering', mode: 'insensitive' } });
  });
});

describe('booking an extra class', () => {
  const day = (items) => ({ items, names: new Map(), target: { cohorts: new Set(), shared: new Map([['SWE303', 2]]) } });
  const swe = { id: 'CC1', moduleId: 'SWE303', code: 'SWE303', start: '13:00', end: '14:00', tutors: ['T1'], extra: true };

  test('TC-UNIT-102: students busy in a class that is still running block the booking', () => {
    const c = clashes(day([{ ...swe, done: false }]), { start: '13:30', end: '14:30', moduleId: 'SUR201' });
    expect(c).toHaveLength(1);
    expect(blocks(c[0], true)).toBe(true);
  });
  test('TC-UNIT-103: once that class\'s attendance is finished, it is only a warning', () => {
    const c = clashes(day([{ ...swe, done: true }]), { start: '13:30', end: '14:30', moduleId: 'SUR201', tutorId: 'T1', self: 'T1' });
    expect(c.length).toBeGreaterThan(0);
    expect(c.every((x) => !blocks(x, true))).toBe(true);
    expect(c[0].text).toMatch(/attendance already taken/);
  });
  test('TC-UNIT-104: clash messages use 12-hour time', () => {
    const c = clashes(day([{ ...swe, done: false }]), { start: '13:30', end: '14:30', moduleId: 'SUR201' });
    expect(c[0].text).toContain('1:00 PM–2:00 PM');
    expect(t12('00:15')).toBe('12:15 AM');
    expect(t12('12:00')).toBe('12:00 PM');
  });
  test('TC-UNIT-105: slots cover the whole day (7 AM–10 PM) around the college periods, without overlaps', () => {
    const p = dayPeriods([{ start: '08:00', end: '09:00' }, { start: '10:15', end: '11:15' }]);
    expect(p[0]).toEqual({ start: '07:00', end: '08:00' });
    expect(p[p.length - 1]).toEqual({ start: '21:00', end: '22:00' });
    expect(p.some((x) => x.start === '17:00')).toBe(true);
    expect(p.some((x) => x.start === '10:00')).toBe(false); // would overlap 10:15–11:15
  });
});
