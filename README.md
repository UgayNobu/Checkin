# CheckIn — Student Attendance System

A hardware-free attendance platform for the College of Science and Technology
(CST). Instead of calling out names or passing around a paper sheet, the tutor
opens a 2-minute check-in code at the start of class and students check in from
their own phone. CheckIn checks the code, the student's enrolment and their
location (inside the class's building, or near the tutor for practicals), then
records attendance automatically. Uncertain check-ins are flagged for the tutor
to decide. Students, tutors, admins and management each get their own dashboard.

## Live app

| | Link |
|---|---|
| **App** | **https://checkin-cst-group2.vercel.app** |
| Backend API | https://checkin-backend-gzbg.onrender.com (health check: [`/health`](https://checkin-backend-gzbg.onrender.com/health)) |
| Latest release | [v2.0.0 – First deployment](https://github.com/UgayNobu/Checkin/releases/tag/v2.0.0) |

The frontend is hosted on **Vercel**, the backend API on **Render** and the database on **Supabase**. Both links use HTTPS, so phone location works for check-in.

**Install it on a phone:** open the app link, then on Android tap **Install app** (or ⋮ → Add to Home screen); on iPhone open it in Safari and tap **Share → Add to Home Screen**.

> The backend runs on Render's free plan and sleeps after 15 minutes without visitors. The first request after that takes about 50 seconds, so open the `/health` link a minute before a demo or class.

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
- Check in on the Attendance page: tap the building card that lights up (IT, LT, Academic or Library Building, or Workshop/Practical), pick the class and enter the code. The app waits a few seconds for a GPS-quality location before sending it.
- Attendance % per module (theory and practical, hour-weighted), a monthly calendar (tap a day to see each class), and the 90% rule warnings.
- Weekly timetable with cancelled, cover, extra and optional classes (a Sunday tab appears for Sunday extra classes); notifications when a class changes.
- Join modules with the tutor's enrolment key; upload evidence documents (PDF/images) for missed classes.

**Tutors**
- Timetable: start attendance from 15 minutes before a class until it ends; cancel a class, ask another tutor to cover, or book an extra class (free periods, free rooms and clash checks). Optional classes take attendance but never count.
- Start Attendance: 2 minutes for students to check in, then 3 minutes to mark flagged students Present/Absent; anyone undecided or missing is marked Absent.
- Geofence per session: the class's building outline, or a Workshop circle around the tutor with a radius they choose (5–500 m).
- Live counts, records per module and student, CSV/PDF exports, reports, evidence documents (view), profile and password.

**Admins**
- Programmes, modules and tutor assignments.
- Add tutor (Admin home → Tutors view → + Add tutor): creates a tutor account that works straight away with the default password (`DEFAULT_TUTOR_PASSWORD`, default `Tutor@2026`); the tutor can change it in Settings → Account.
- Tutor requests on the Admin home page: approve or reject tutors who signed up themselves and aren't in the system yet. New tutors also show in their programme's Tutors view before they get a module.
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
| Hosting | Vercel (frontend), Render (backend), Supabase (database) |
| CI/CD | GitHub Actions; Docker images on GitHub Packages |
| Testing | Jest (backend), Vitest (frontend), Docker smoke test; Postman / Thunder Client for the API |
| Mobile | Installable web app (PWA) |

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
├── .github/workflows/        # CI/CD pipeline
├── docker-compose.yml        # local Docker stack (own Postgres)
├── docker-compose.prod.yml   # production (GHCR images + Supabase)
├── scripts/smoke-test.sh     # end-to-end check used by CI
├── docs/                     # proposal, sprint reports, DEPLOYMENT.md
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

The link changes each time the tunnel restarts, and the app works on phones only while that laptop runs the backend, frontend and tunnel. Turn on **Precise location** on each phone (iPhone: Settings → Privacy & Security → Location Services → Safari/Chrome; Android: Settings → Location → Use precise location).

Or run both from the repo root in one terminal: `npm run install:all` once, then `npm run dev`.

### Or: run everything in Docker

No Node, Supabase or `.env` values needed. Docker starts its own local database with the seed data.

```bash
cp .env.example .env          # then set JWT_SECRET
docker compose up -d --build  # open http://localhost:8080
```

The CI/CD pipeline, image publishing and server deployment are covered in [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).

### On a phone

Use the live app: https://checkin-cst-group2.vercel.app (see [Live app](#live-app) above). How the hosting was set up is in [docs/MOBILE.md](./docs/MOBILE.md).

### Test accounts

These accounts exist in the seed data used by Docker and the local setup, with the password `Test@1234`. Passwords for the live app are shared within the team, never in this repo.

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
- Geofences:
  - **Buildings** (IT, LT, Academic, Library): the building's outline from the map plus a **10 m** margin.
  - **Workshop** (labs, LH-01, unmapped rooms): a circle around the tutor's location when they start, radius chosen by the tutor (default 30 m, 5–500 m). If the tutor starts from a laptop, use a bigger radius, because laptops have no GPS.
- **Accuracy tolerance** (`ACCURACY_FLAG_METRES` in `backend/.env`): a reading less precise than this is flagged even inside the geofence. We use **150 m**, because laptops guess their location from Wi-Fi and phones indoors often report 50–150 m. It does not widen the geofence: the reported point must still be inside the building (or circle). Set it lower (e.g. 50) for stricter checks.
- Cancelled classes don't count, so nobody is marked absent for them.

## Environment variables & secrets

This repo is **public**. `.env` files are git-ignored, and only `.env.example` files with placeholder values belong in the repo. Before your first commit, check:

```bash
git check-ignore backend/.env frontend/.env   # should print both paths
```

## Deployment and CI/CD

```
feature branch → PR into dev → 3 checks must pass → merge
dev → PR into main → 3 checks must pass → merge → live
```

Every pull request and push to `dev` or `main` runs the GitHub Actions pipeline ([`.github/workflows/ci-cd.yml`](./.github/workflows/ci-cd.yml)):

| Check | What it does |
|---|---|
| **Backend checks** | Install, validate the Prisma schema, syntax-check every file, Jest unit tests, security audit |
| **Frontend build** | Vitest unit tests, then a production build |
| **Docker build + smoke test** | Builds the images, starts the full stack and logs in through the API |

`dev` and `main` are protected by rulesets: a pull request is required, force pushes are blocked, and all three checks must be green before merging.

When something is merged into **`main`**:

- **Backend:** GitHub Actions calls the Render deploy hook (repo secret `RENDER_DEPLOY_HOOK`), only after all checks pass. Render's own auto-deploy is off.
- **Frontend:** Vercel builds and deploys `main` by itself. Other branches and pull requests get a Vercel preview link.
- **Docker images** are published to GitHub Packages (`checkin-backend`, `checkin-frontend`).

Hosting settings (database URLs, JWT secret, email) are kept in the Render and Vercel dashboards, never in the repo. Details: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) and [docs/MOBILE.md](./docs/MOBILE.md).

**Making a release:** open a pull request from `dev` into `main`, merge it when green, then tag it (`git tag vX.Y.Z && git push origin vX.Y.Z`) and publish it under [Releases](https://github.com/UgayNobu/Checkin/releases).

## Branching model

We use a simplified **main / dev / feature** flow:

- **`main`**: always stable, and what the live app runs. Protected; changes arrive only by pull request from `dev` with all checks green.
- **`dev`**: integration branch. All feature work merges here first (also protected: pull request and green checks).
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
| Live app is slow to log in the first time | The free Render backend was asleep. Wait about 50 seconds, or open the `/health` link first. |
| A check is red on your pull request | Click **Details** next to the check to see which step failed, fix it on your branch and push again. |
| `invalid file request` in Docker on Windows | The project is inside OneDrive. Move it to a normal folder such as `C:\dev\Checkin`. |

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
