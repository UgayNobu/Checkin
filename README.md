# CheckIn — Student Attendance System

A hardware-free attendance platform for the College of Science and Technology
(CST). Instead of calling out names or passing around a paper sheet, the tutor
opens a 2-minute check-in code at the start of class and students check in from
their own phone. CheckIn checks the code, the student's enrolment and their
location (inside the class's building, or near the tutor for practicals), then
records attendance automatically. Uncertain check-ins are flagged for the tutor
to decide. Students, tutors, admins and management each get their own dashboard.

## Team

| Member | Role |
|---|---|
| Dechen Wangmo | Team Lead |
| Ugyen Norbu | Member |
| Damchey Lhendup | Member |
| Sanskar Gurung | Member |
| Sanjuck Subba | Member |

## Features

**Students**
- Check in on the Attendance page: tap the building card that lights up (IT, LT, Academic or Library Building, or Workshop/Practical), pick the class and enter the code.
- Attendance % per module (theory and practical, hour-weighted), a monthly calendar (tap a day to see each class), and the 90% rule warnings.
- Weekly timetable with cancelled, cover, extra and optional classes; notifications when a class changes.
- Join modules with the tutor's enrolment key; upload evidence documents (PDF/images) for missed classes.

**Tutors**
- Timetable: start attendance from 15 minutes before a class until it ends; cancel a class, ask another tutor to cover, or book an extra class (free periods, free rooms and clash checks). Optional classes take attendance but never count.
- Start Attendance: 2 minutes for students to check in, then 3 minutes to mark flagged students Present/Absent; anyone undecided or missing is marked Absent.
- Geofence per session: the class's building outline, or a Workshop circle around the tutor with a radius they choose (5–500 m).
- Live counts, records per module and student, CSV/PDF exports, reports, evidence documents (view), profile and password.

**Admins**
- Programmes, modules and tutor assignments; approve tutor sign-ups.
- Activate/deactivate students and tutors with a reason (graduated, resigned …); accounts are never deleted.
- Semesters: add the next semester and start it; past semesters stay viewable.

**Management**
- Department, programme and module overviews, attendance trends, student history, tutor reports.
- Approve/decline evidence documents.
- Class changes: every cancelled, cover, extra and optional class, plus timetable classes nobody took.

**Other**
- Forgot password with a 6-digit code by email; works on phones (slide-in menu) and big screens.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | Node.js, Express.js (plain JavaScript) |
| Database | PostgreSQL on Supabase, Prisma ORM |
| Auth | JWT (bcrypt-hashed passwords) |
| Geolocation | Browser Geolocation API; building outlines (point-in-polygon) and Haversine distance |
| Email | Nodemailer (Gmail SMTP for the project) |
| Exports | CSV, PDF (pdfkit) |
| API testing | Postman / Thunder Client |

## Project structure

```
Checkin/
├── frontend/                 # React + Vite app
│   └── src/pages/            # student, teacher, admin, management, shared, public
├── backend/
│   ├── src/
│   │   ├── server.js         # starts the API (+ the every-minute session sweep)
│   │   ├── app.js            # assembles middleware and routers
│   │   ├── routes/           # URL → guards → controller
│   │   ├── controllers/      # read the request, call one service, send JSON
│   │   ├── services/         # all business rules and database work
│   │   ├── validators/       # zod rules for request bodies, queries and params
│   │   ├── middleware/       # auth, roles, validation, uploads, rate limits, errors
│   │   ├── utils/ lib/ config/
│   ├── API.md                # every API route
│   ├── scripts/              # create-admin, import-roster, set-test-passwords
│   ├── uploads/              # uploaded evidence documents and avatars (not in git)
│   └── prisma/
│       ├── schema.prisma     # Prisma map of the database tables
│       ├── database.sql      # all database changes + seed data
│       └── seed.js           # npm run seed – loads the seed data part
├── docs/                     # proposal, sprint reports
└── README.md
```

## Getting started

### Prerequisites

- Node.js (LTS) and Git
- The real `.env` values. Ask the team lead; they are **never** shared on GitHub or in group chats.

### 1. Clone

```bash
git clone https://github.com/UgayNobu/Checkin.git
cd Checkin
git checkout dev
```

### 2. Environment files

Copy `.env.example` to `.env` in **both** `backend/` and `frontend/`, then fill in the real values.

| File | Variables |
|---|---|
| `backend/.env` | `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `PORT`; email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`; optional: `GEOFENCE_METRES` (40), `REVIEW_MINUTES` (3), `START_EARLY_MINUTES` (15), `REQUIRED_ATTENDANCE_PERCENT` (90), `AT_RISK_ATTENDANCE_PERCENT` (80) |
| `frontend/.env` | `VITE_API` – the backend URL, e.g. `http://localhost:5001/api` |

### 3. Run (two terminals)

```bash
# Terminal 1 – backend
cd backend
npm install
npm run generate   # again after every pull that changes schema.prisma
npm run dev        # "CheckIn API ready"

# Terminal 2 – frontend
cd frontend
npm install
npm run dev        # open http://localhost:5173
```

Check the backend is up with `curl http://localhost:5001/health`. To check email, run `npm run mail:test -- you@example.com` in `backend/`.

> **macOS:** port 5000 is used by AirPlay Receiver, so we use port **5001**. Either turn AirPlay Receiver off, or keep `PORT=5001` in `backend/.env` and `VITE_API` pointing to 5001.

### Demo on phones

Phones only share their location with **https** pages, and `localhost` on a phone is the phone itself. So for a phone demo, one laptop runs everything and a free Cloudflare tunnel gives it an https link:

1. In `frontend/.env` set `VITE_API=/api` (Vite then forwards `/api` to the backend on port 5001; set `VITE_PROXY_TARGET` if yours runs elsewhere) and restart the frontend.
2. `brew install cloudflared`, then `cloudflared tunnel --url http://localhost:5173`.
3. Open the printed `https://….trycloudflare.com` link on the phones and allow **precise** location.

The link changes each time the tunnel restarts. Laptops have no GPS (they guess from Wi-Fi, often 50–150 m off), so laptop check-ins are often flagged. For laptop-only testing you can set `ACCURACY_FLAG_METRES=150` in `backend/.env`, but put it back to 50 for real use.

### Test accounts

Test accounts use the password `Test@1234` (change them before real use).

| Role | ID |
|---|---|
| Admin | `CST-ICT01` |
| Management | `CST-MGT01` |
| Tutor | `CST-0142` |
| Student | `U004` |

New students sign up themselves; new tutors request an account and the admin approves it.

## Database

The whole team shares **one** Supabase database, so database changes go through the team lead.

- `backend/prisma/database.sql` holds every change to the original schema in numbered parts, plus seed data at the end. Each part is safe to re-run: it only adds what is missing.
- To apply a change, run **only that part** in the Supabase SQL Editor. Don't re-run the whole file on the shared database: the seed data at the end would bring back sample rows that were cleaned up.
- After any change to `schema.prisma`, everyone runs `npm run generate`.
- **Never** run `prisma migrate` or `prisma db push` against Supabase. They can drop tables.

| Part | What it adds |
|---|---|
| 0–2 | Evidence documents (renamed from relief requests), columns the frontend and backend need |
| 3 | Departments and programme details |
| 4 | VLE-style enrolment keys |
| 5 | Curriculum (a module in several programmes) |
| 6 | Rooms and the weekly timetable |
| 7 | Forgot-password codes |
| 8 | Uploaded files stored in the database |
| 9 | Semesters (academic sessions); assignments and enrolments belong to a semester |
| 10 | Deactivated accounts (reason, note, date, by whom) |
| 11 | Class changes (cancelled, cover, extra/optional classes) |

Main tables: `users`, `departments`, `programs`, `modules`, `program_modules`, `sections`, `enrollments`, `academic_sessions`, `rooms`, `timetable_slots`, `class_changes`, `class_sessions`, `attendance_codes`, `attendance`, `evidence_documents`, `stored_files`, `password_resets`, `notifications`, `audit_logs`.

The building outlines and room lists are in `backend/src/config/buildings.js` (no database table).

## Attendance rules

- Attendance % = hours attended ÷ hours of classes held, per module (theory and practical counted separately and together). Optional classes never count.
- Students need **90%**; under **80%** they are at risk.
- A check-in is **Present** inside the geofence, **refused** when clearly outside, and **Flagged** when GPS is weak or location is missing. The tutor decides flagged students within the review time; undecided ones become Absent.
- Cancelled classes don't count, so nobody is marked absent for them.

## Environment variables & secrets

This repo is **public**. `.env` files are git-ignored, and only `.env.example` files with placeholder values belong in the repo. Before your first commit, check:

```bash
git check-ignore backend/.env frontend/.env   # should print both paths
```

## Branching model

We use a simplified **main / dev / feature** flow:

- **`main`**: always stable. Protected; changes arrive only by pull request with at least one review.
- **`dev`**: integration branch. All feature work merges here first.
- **`feature/<task-id>-<short-desc>`**: one branch per task, created from the latest `dev`.

```bash
git checkout dev && git pull
git checkout -b feature/T213-auth-login
# work, then:
git add -A
git commit -m "T213: add login form and validation"
git push -u origin feature/T213-auth-login
```

Open the pull request on GitHub into **`dev`** (not `main`). After it is merged, delete the branch. At the end of a sprint, when `dev` is stable, merge `dev` into `main`.

### Commit message convention

```
<task-id>: short imperative description
e.g. T208: set up repo structure and branch protection
```

### Dos and don'ts

- Pull `dev` before starting work, and run `npm install` after pulling.
- Don't push directly to `dev` or `main`.
- Don't commit `.env` files, `node_modules` or uploads.
- Don't send code as zip files. Push a branch instead.
- Don't run `npm audit fix --force`, upgrade Prisma, or use `sudo npm install`.

## Common problems

| Problem | Fix |
|---|---|
| `Missing script: "dev"` | You're in the wrong folder. `cd backend` or `cd frontend` first. |
| `EACCES` / permission denied | `sudo chown -R $(whoami) <project folder>`, delete `node_modules`, then `npm install`. |
| `EADDRINUSE :::5000` | AirPlay is using the port. Use 5001 (see above). |
| `Can't reach database server` | College Wi-Fi may block Supabase ports, so try a phone hotspot. Also check that the Supabase project isn't paused. |
| `Account is not active` | New tutor accounts need admin approval. |
| `Column … does not exist` | The database is missing a part of `database.sql`. Tell the team lead. |
| `Unknown field … for select statement` | Run `npm run generate` in `backend/`, then restart. |
| "This class is … You can start attendance from …" | It isn't class time. Book an extra class on the Timetable to teach now. |

## Issues

Log bugs and blockers as GitHub Issues, tagged with the related sprint task ID.

## Supervisors

This repo is public so our guide and co-guide can follow progress.

| Role | Name |
|---|---|
| Guide | Mr. Parsu Ram Dhungyel |
| Co-Guide | Mr. Pema Namgay |

The project proposal and weekly sprint reports are in [`docs/`](./docs).

## License

No license has been applied yet. This is a supervised college capstone project, not intended for external reuse at this stage.
