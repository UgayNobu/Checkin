# CheckIn – fixes after the supervisor review, and load test (27 Nov 2026)

Branch `issues-27nov`. Fifteen issues raised in the review with the guide and in testing.

## Changes

| # | Issue | What changed |
|---|---|---|
| 1 | "More" and the bell overlapped in the tutor's top bar | The bar now moves links into "More" one at a time when they would not fit, so nothing overlaps at any width. |
| 2 | A practical booked with no place; the student could not check in | The place of a practical is required when booking and starting it (frontend and API). In testing, the Workshop card is disabled only when the student is not enrolled in that module, so check enrolment first if a student cannot check in. |
| 3 | "Attendance taken" on the Timetable could not be opened | It is now a link to that class's record (present, flagged, absent, excused); the dashboard has "View record" too. Old weeks keep it. |
| 4 | Management was not told about new absence requests | Every active management account gets a bell notification (and an email when they set a real address) when a student submits one. |
| 5 | Admin had no bell | Admin has the bell; a tutor account request opens the requests list. Email too once a real address is set. |
| 6 | Past records only for management | Tutors: "History" on the class list shows a student's attendance in every semester, with "this semester vs last semester" (only students they teach now). Students: semester picker on the dashboard, past semesters read-only. |
| 7 | 80% rule for approved medical / official leave | Approved days are now **Excused** (purple), not Present, so the % stays real. 90% is required; 80–90% is allowed when approved leave covers that module; under 80% is never allowed. The daily low-attendance alert follows the same rule. |
| 8 | Landing page said 4 roles but showed only Student and Tutor | "Tutor" is now "Staff" (tutors, management, ICT admin); login says "Staff login"; sign-up link says "Request a tutor account". |
| 9 | Worst cases: no internet in some rooms | A check-in made with no internet is saved on the phone and sent when it is back online (until the class ends, if the code was valid then); it is always flagged for the tutor. Tutors can "Mark present" a student with no internet from the class list (reason saved, audit log, student told). |
| 10 | Can it handle 1,000 students? | Load test script and results below. |
| 11 | Remove test data | Two SQL files (preview, then delete) run in Supabase by the database owner. |
| 12 | Old notifications never go away | The daily job removes read notifications after 30 days and unread ones after 90 (settings NOTIFY_KEEP_READ_DAYS, NOTIFY_KEEP_DAYS). |
| 13 | Settings page used half the width; one switch on its own tab | One Settings page for tutor, management and admin: profile and email (editable), email notifications, change password, side by side. Footer no longer half-hidden behind the page. |
| 15 | No way to upload a new semester's timetable | Admin → Semesters → Upload a timetable: download the CSV template, upload, see every problem with its row number, then save. Replacing is refused once attendance has been taken from that semester's timetable. |

Database: Part 19 in `backend/prisma/database.sql` makes sure the attendance status accepts "Excused" (safe to run again; normally nothing changes).

## Load test (issue 10)

`node backend/scripts/load-test.js 1000 120` – only runs against a local copy (local database and API), adds 1,000 test students, measures, then removes them.

Run on 27 Nov 2026 on a 2-CPU test machine with the local PostgreSQL:

| Test | Requests | Errors | Median | 95% under | Slowest |
|---|---|---|---|---|---|
| 1,000 check-ins spread over the 2-minute window (8.3 per second) | 1,000 | 0 | 13 ms | 17 ms | 58 ms |
| 1,000 check-ins, 100 at the same moment (worst case) | 1,000 | 0 | 382 ms | 1,083 ms | 2,194 ms |
| 50 logins at the same moment (password hashing on purpose) | 50 | 0 | 3.5 s | 3.5 s | 3.5 s |

All 2,000 check-ins were saved. The design handles a college-wide rush; the free hosting plans (Render sleeps after 15 minutes and has a very small CPU; Supabase free has 500 MB) are the limit for real use, not the code.

## Tests

Backend 111 unit tests (TC-UNIT-129 to 140 new), frontend 31 (TC-UNIT-141, 142 new), all passing.
