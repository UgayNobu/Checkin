# CheckIn — Student Attendance System

A hardware-free attendance and engagement platform for the College of
Science and Technology (CST). Instead of tutors calling out names or passing
around a paper sheet, a tutor opens a time-limited check-in code at the start
of class, and students check in from their own device. The system checks the
code and the student's location, then records attendance automatically.
Check-ins from outside the classroom are flagged for the tutor to review.
Students, tutors, admins and management each get their own dashboard.

## Team

| Member | Role |
|---|---|
| Dechen Wangmo | Team Lead · Database |
| Ugyen Norbu | Member |
| Damchey Lhendup | Member |
| Sanskar Gurung | Member · Frontend |
| Sanjuck Subba | Member |

## Features

- **Students:** check in with a code and their location, see attendance per module (theory/practical), view a calendar, join modules with an enrolment key, and upload evidence documents for missed classes.
- **Tutors:** start sessions with a timed code and geofence, see a live roster, accept or reject flagged check-ins, end sessions, review evidence documents, and export attendance as CSV or PDF.
- **Admins:** manage users, programmes and modules, approve or reject tutor sign-ups, view the audit log, list at-risk students, and send low-attendance alerts.
- **Management:** department and module overviews, attendance trends, student history and tutor reports.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | Node.js, Express.js (plain JavaScript) |
| Database | PostgreSQL on Supabase, Prisma ORM |
| Auth | JWT (bcrypt-hashed passwords) |
| Geolocation | Browser Geolocation API + Haversine formula |
| Exports | CSV, PDF (pdfkit) |
| API testing | Postman / Thunder Client |

## Project structure

```
Checkin/
├── frontend/                 # React + Vite app
│   └── src/pages/            # student, teacher, admin, management, shared, public
├── backend/
│   ├── server.js             # Express API (all routes)
│   ├── seed.js               # npm run seed – loads seed data
│   ├── API_ADDITIONS.md      # extra API routes (sessions, reports, exports…)
│   ├── scripts/              # set-test-passwords.js
│   ├── uploads/              # uploaded evidence documents and avatars (not in git)
│   └── prisma/
│       ├── schema.prisma     # Prisma map of the database tables
│       └── database.sql      # all database changes + seed data
├── docs/                     # proposal, sprint reports
└── README.md
```

## Getting started

### Prerequisites

- Node.js (LTS) and Git
- The real `.env` values. Ask Dechen; they are **never** shared on GitHub or in group chats.

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
| `backend/.env` | `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `PORT`, `GEOFENCE_METRES` (optional: attendance thresholds) |
| `frontend/.env` | `VITE_API` – the backend URL, e.g. `http://localhost:5001/api` |

### 3. Run (two terminals)

```bash
# Terminal 1 – backend
cd backend
npm install
npm run generate
npm run dev        # "CheckIn API ready"

# Terminal 2 – frontend
cd frontend
npm install
npm run dev        # open http://localhost:5173
```

Check the backend is up with `curl http://localhost:5001/health`.

> **macOS:** port 5000 is used by AirPlay Receiver, so we use port **5001**. Either turn AirPlay Receiver off, or keep `PORT=5001` in `backend/.env` and `VITE_API` pointing to 5001.

### Test accounts

All seeded users use the password `Test@1234`.

| Role | ID |
|---|---|
| Admin | `U001` |
| Tutor | `U002`, `U003` |
| Student | `U004` – `U007` |
| Management | `U008` |

## Database

The whole team shares **one** Supabase database, so database changes go through Dechen.

- `backend/prisma/database.sql` holds every change to the original schema, plus the seed data. It is safe to re-run in the Supabase SQL Editor: it only adds what is missing and skips rows that already exist.
- `npm run seed` loads only the seed-data part.
- After any change to `schema.prisma`, everyone runs `npm run generate`.
- **Never** run `prisma migrate` or `prisma db push` against Supabase. They can drop tables.

Main tables: `users`, `programs`, `modules`, `sections`, `enrollments`, `class_sessions`, `attendance_codes`, `attendance`, `evidence_documents`, `notifications`, `audit_logs`.

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
| `Column … does not exist` | The database is missing a change. Tell Dechen. |

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
