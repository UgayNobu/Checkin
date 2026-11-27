// 27 Nov review: the timetable upload reads the CSV the admin saves from Excel.
import { describe, expect, test } from 'vitest';
import { parseCsv } from '../pages/admin/TimetableUpload.jsx';

describe('timetable CSV', () => {
  test('TC-UNIT-141: reads the header, quoted commas, Excel BOM and Windows line endings', () => {
    const rows = parseCsv('﻿Programme,Year,Day,Start,End,Module,Tutors\r\n"B.E. Software Engineering",2,Mon,09:00,10:00,SWE303,"Nima, Pema"\r\n\r\n');
    expect(rows).toEqual([{ programme: 'B.E. Software Engineering', year: '2', day: 'Mon', start: '09:00', end: '10:00', module: 'SWE303', tutors: 'Nima, Pema' }]);
  });
  test('TC-UNIT-142: an empty file gives no rows, and "" inside quotes is one quote', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('note\n"say ""hi"""')).toEqual([{ note: 'say "hi"' }]);
  });
});
