# CheckIn API (v3)

Base URL: `http://localhost:5000/api`. Send `Authorization: Bearer <token>` (from login) — the
login also sets an httpOnly cookie, so browsers can use `credentials: 'include'` instead.
Errors always come back as `{ "error": "message", "code": "SOME_CODE" }`.

Paths in brackets are aliases using the design-doc names; both work.

## Auth — `/api/auth`
| Method | Path | Who | What |
|---|---|---|---|
| POST | `/register` | public | Full sign-up form. Students active at once; tutors wait for admin approval |
| POST | `/login` | public | `{ userId, password }` → `{ token, user }` + cookie |
| POST | `/logout` | any | Clears the cookie |
| GET | `/me` | public | Current user, or `null` when logged out |
| GET | `/lookup-id?id=` | public | Roster sign-up step 1: name/email/programme for an ID with no account yet |
| POST | `/student/signup` | public | Roster sign-up step 2: `{ userId, password }` |
| POST | `/tutor/request` | public | Roster sign-up for tutors (admins are notified) |
| POST | `/forgot-password` | public | `{ userId }` → emails a 6-digit code (valid 15 min, works once). Same answer whether or not the ID exists. Without SMTP settings the code is printed in the backend terminal |
| POST | `/reset-password` | public | `{ userId, code, password }` → sets the new password (max 5 wrong codes) |
| POST | `/change-password` | any | `{ current, next }` |

Sign-up rules (checked in the form and again here): student ID = 8 digits, staff ID = `CST-…`,
email must end in `@rub.edu.bt`, name = letters only, password = 8–64 characters with upper and lower case
letters, a number and a symbol.

## Profile — `/api/me` [`/api/profile`]
`GET /` · `PUT /` `{ name, email, phone, prefs }` · `PUT /password` · `POST /avatar` (form field `file`, PNG/JPG/WebP ≤ 2 MB) · `DELETE /avatar`

## Notifications — `/api/notifications`
`GET /` · `GET /unread-count` · `PUT /:id/read` · `POST /read-all`

## Student
| Method | Path | What |
|---|---|---|
| GET | `/api/student/dashboard` | % per enrolled module |
| GET | `/api/student/summary` | Overall rate, sessions + hours missed |
| GET | `/api/student/modules/:id/records` | Session list split into theory / practical |
| GET | `/api/modules/browse` [`/api/student/modules`] | Every module in each programme's curriculum, with `selfEnrol` and `enrolled` (no keys) |
| POST | `/api/modules/enrol` [`/api/student/enrol`] | `{ module, key }` (VLE-style: pick the module, type its key) or `{ key }`. Refused when self-enrolment is closed |
| POST | `/api/attendance/checkin` [`/api/checkin`] | `{ code, lat, lng, accuracy, permissionDenied, locationError, offline }` → present or flagged with a reason |
| GET | `/api/student/timetable` | My weekly timetable (from my programme and year) |
| GET | `/api/attendance/me?month=2026-10` [`/api/student/calendar`] | `{ day: present/flagged/absent }` |

## Teacher — `/api/teacher` [`/api/tutor`]
| Method | Path | What |
|---|---|---|
| GET | `/dashboard` | Totals, today's sessions, flagged check-ins + pending requests |
| GET | `/modules` | My modules with enrolment keys |
| GET | `/modules/export.pdf` | PDF of every module and student % |
| GET | `/records/:moduleId` | Theory / practical / total % and flagged count per student |
| GET | `/records/:moduleId/:studentId` | Day-by-day for one student: present / flagged / absent, with the flag reason |
| GET | `/records-export/:moduleId/csv` · `/pdf` | Downloads |
| GET | `/reports` | 6-week trend per module |
| GET | `/timetable` | My weekly timetable (slots linked to me or listing my name) |

Module management — `/api/modules`: `GET /:id/key/suggest` · `PUT /:id/key` `{ key?, selfEnrol? }` (keys are unique; `''` removes the key) · `GET /:id/students` · `POST /:id/students` `{ userId }` · `DELETE /:id/students/:studentId` (tutor or admin; the student is notified)

Sessions — `/api/sessions`:
| Method | Path | What |
|---|---|---|
| POST | `/` [`/start`] | `{ module, room, type, hours, lat, lng, minutes?, radius? }` or `{ sessionId, lat, lng }` to re-open |
| GET | `/mine?limit=&status=` | My sessions |
| GET | `/:id/live` | Counter for the start screen, flagged students with their reason; closes the session once the code (plus grace time) has run out |
| GET | `/:id/roster` | Every enrolled student with status, distance, accuracy, flag reason |
| POST | `/:id/end` | Ends the session; the code stops working and every enrolled student who didn't check in is recorded Absent |
| POST | `/:id/flagged/:attendanceId/accept` · `/reject` | `{ note? }` |
| POST | `/:id/students/:studentId/mark` | `{ status: 'present' \| 'absent' }` |

## Evidence documents — `/api/evidence`
`POST /` (student, multipart: `module, date, type, reason, file`) · `GET /mine` (student) ·
`GET /?status=pending` (teacher: own modules; admin/management: all) · `GET /:id` ·
`PATCH /:id` [`POST /:id/review`] `{ status: approved|rejected, note? }` — approving marks every session of
that module on that day Present.

## Admin — `/api/admin` (changes: admin; reports: admin + management)
`GET /overview` · `GET|POST|PUT /programs` · `GET /programmes/:name/report` · `GET /programmes/:name/export.csv` ·
`GET /users?role=&department=&programme=&year=` · `PATCH /users/:id` `{ active?, name? }` ·
`GET /modules?department=&year=&semester=` (filters through `program_modules`) · `POST /modules` · `PUT /modules/:id` (also links the module to the programme's year and semester) ·
`GET /tutors/pending` · `POST /tutors/:id/approve` · `POST /tutors/:id/reject` ·
`GET /audit-logs?action=&from=&to=&q=&limit=` · `GET /audit-actions` ·
`GET /reports/at-risk?below=&department=` · `GET /reports/at-risk/export.csv` · `POST /jobs/low-attendance`

## College structure, rooms and timetable — `/api`
| Method | Path | Who | What |
|---|---|---|---|
| GET | `/departments` | public | The 6 CST departments with their programmes (sign-up form) |
| GET | `/programs?level=Bachelor` | public | All programmes with level, duration and department |
| GET | `/rooms` | any | Classrooms and labs |
| GET | `/timetable?program=&year=` | any | The fixed weekly timetable for one programme and year |

## Management — `/api/management`
`GET /overview` · `GET /department/:name` · `GET /module/:id` · `GET /student/:id?module=` · `GET /teachers` ·
`GET /history?q=&year=&semester=&department=` · `GET /calendar?student=&module=&month=`

## Check-in rules
- A code is 6 characters, never reused, and valid for `CHECKIN_WINDOW_MINUTES` (default 5).
- Flag reasons: `permission_denied` (location not shared), `location_error` (browser could not get a location),
  `outside_radius`, `low_accuracy` (accuracy worse than 50 m, or the GPS error margin could put the student inside the room)
  and `network_issue` (sent with `offline: true` up to `NETWORK_GRACE_SECONDS` after the code expired).
- Every minute the server closes sessions whose code has run out and records the students who didn't check in as Absent.

## How attendance % is calculated
Hour-weighted: hours attended (Present or Late) ÷ hours of sessions already held × 100.
A 2-hour practical counts twice a 1-hour lecture. Flagged check-ins don't count until the tutor accepts them.
All of this lives in `src/services/stats.service.js`.
