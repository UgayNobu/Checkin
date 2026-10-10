# Backend additions

These features come from the backend design doc. They were added to `server.js` in plain JavaScript; nothing that already existed was removed.
Run `prisma/database.sql` in Supabase (safe to re-run), then `npm install` and `npm run generate`.

All routes need `Authorization: Bearer <token>`, except `/health`.

| Method | Route | Who | What it does |
|---|---|---|---|
| GET | `/health` | anyone | Server status check |
| GET | `/api/sessions/mine?limit=50` | teacher | The teacher's sessions, newest first, with status and number of check-ins |
| POST | `/api/sessions/:id/end` | teacher | Ends a session; its code stops working immediately |
| GET | `/api/sessions/:id/roster` | teacher | Live list: every enrolled student with present/flagged/absent, flag reason, distance and GPS accuracy, plus counts |
| POST | `/api/sessions/:id/flagged/:attendanceId/accept` | teacher | Marks a flagged check-in Present and notifies the student (optional body `{ note }`) |
| POST | `/api/sessions/:id/flagged/:attendanceId/reject` | teacher | Marks a flagged check-in Absent and notifies the student |
| GET | `/api/evidence/:id` | student (own), teacher (own module), admin, management | One evidence document, with file name, reviewer and review time |
| GET | `/api/teacher/records-export/:moduleId/csv` | teacher | Downloads the module's attendance as CSV |
| GET | `/api/teacher/records-export/:moduleId/pdf` | teacher | Downloads the module's attendance as PDF |
| GET | `/api/admin/tutors/pending` | admin, management | Tutor sign-ups waiting for approval |
| POST | `/api/admin/tutors/:id/approve` | admin | Approves a tutor (notification + audit log entry) |
| POST | `/api/admin/tutors/:id/reject` | admin | Rejects a pending tutor (audit log entry) |
| GET | `/api/admin/audit-logs?action=&from=&to=&q=&limit=` | admin, management | Audit log viewer with filters |
| GET | `/api/admin/audit-actions` | admin, management | List of action names, for a filter dropdown |
| GET | `/api/admin/reports/at-risk?below=80&department=` | admin, management | Students below the threshold in any module |
| GET | `/api/admin/reports/at-risk/export.csv` | admin, management | The same list as CSV |
| GET | `/api/admin/programmes/:name/export.csv` | admin, management | Per-student overall % for one programme (department) |
| POST | `/api/admin/jobs/low-attendance` | admin | Notifies every student below `REQUIRED_ATTENDANCE_PERCENT` in a module; skips anyone alerted in the last 7 days |
| GET | `/api/notifications/unread-count` | any | `{ count }` |
| POST | `/api/notifications/read-all` | any | Marks all of the user's notifications as read |
| POST | `/api/me/avatar` | any | Uploads a profile picture (form field `file`; PNG, JPG or WebP; max 2 MB) |
| DELETE | `/api/me/avatar` | any | Removes the profile picture |

## Changes to existing routes (backwards compatible)

- `POST /api/attendance/checkin` also accepts `accuracy` and `permissionDenied`. It saves the GPS position, distance and flag reason (`outside_radius`, `low_accuracy` or `permission_denied`), and returns `flagReason` and `distance`. A check-in is refused once the session has ended.
- `POST /api/sessions` creates the session with `status: 'ongoing'`.
- `POST /api/evidence` saves the uploaded file's original name. `PATCH /api/evidence/:id` records when it was reviewed.
- `PATCH /api/admin/users/:id` with `active` also updates `users.status`. Pending tutors are those with `is_active = false` and `status = 'active'`.
- `GET /api/me` (and other user responses) include `avatarUrl`.
- Security: `helmet` headers and a rate limit of 300 requests per minute per IP.

## Not added

- Signing up by looking up an ID from a pre-loaded roster. The existing register flow already covers sign-up.
- Cookie login and logout. The existing frontend uses a token in localStorage; it logs out by clearing it.
- Email alerts (nodemailer). These need SMTP credentials; the alerts are sent as in-app notifications instead.
- Supabase Storage uploads. Files still go to `backend/uploads/`.
- The TypeScript files themselves, as agreed with the team.
