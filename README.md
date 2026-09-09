# CheckIn — Student Attendance System

A credit-based, hardware-free attendance and engagement platform for the
College of Science and Technology (CST). Instead of tutors calling out
names or passing around a paper sheet, a tutor opens a time-limited
check-in code at the start of class, and students check in from their
own device. The system verifies the code and the student's location,
then records attendance automatically. Students, tutors, and admin
staff each get a dashboard suited to their role.

## Team

| Member | Role |
|---|---|
| Dechen Wangmo | Team Lead |
| Ugyen Norbu | Git flow / repo owner |
| Damchey Lhendup | Member |
| Sanskar Gurung | Member |
| Sanjuck Subba | Member |

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, Next.js, Tailwind CSS |
| Backend | Node.js, Express.js |
| Database | PostgreSQL, Prisma ORM |
| Geolocation | Browser Geolocation API + Haversine formula |
| Storage | Supabase Storage |
| Hosting | Vercel (frontend) + Render (backend) |
| API testing | Postman / Thunder Client |

## Project structure

```
checkin/
├── frontend/          # Next.js app
├── backend/           # Node.js / Express API
├── docs/              # ERD, Figma exports, proposal, sprint reports
└── README.md
```

## Getting started

### Prerequisites
- Node.js (LTS)
- npm or pnpm
- PostgreSQL instance (local or a shared Supabase/hosted dev database — ask Ugyen for credentials)
- Git

### Clone and run

```bash
git clone https://github.com/<org-or-username>/checkin.git
cd checkin

# Frontend
cd frontend
npm install
npm run dev          # runs on http://localhost:3000

# Backend (in a second terminal)
cd backend
npm install
cp .env.example .env  # fill in DATABASE_URL and other secrets
npx prisma generate
npm run dev           # runs on http://localhost:5000 (adjust if different)
```

### Environment variables

This repo is **public**, so `.env` must never be committed. Only
`.env.example` (placeholder values, no real secrets) belongs in the repo.
`.env` is already covered by the Node `.gitignore` — double-check it's
being ignored before your first commit:

```bash
git check-ignore backend/.env   # should print the path back if it's ignored
```

Real values (database URL, Supabase keys, etc.) get shared directly
between teammates, not through Git.

## Branching model

We use a simplified **main / dev / feature** flow:

- **`main`** — always stable and deployable. Protected: no direct pushes, PRs only, requires at least 1 review.
- **`dev`** — integration branch. All feature work merges here first.
- **`feature/<task-id>-<short-desc>`** — one branch per task, created off the latest `dev`.

### Naming convention

```
feature/T210-nextjs-scaffold
feature/T211-express-scaffold
feature/T212-prisma-schema
feature/T213-auth-login
```

Use the Sprint task ID (e.g. `T210`) so it's traceable back to the sprint board.

### Day-to-day workflow

```bash
# 1. Make sure dev is up to date
git checkout dev
git pull origin dev

# 2. Create your feature branch
git checkout -b feature/T213-auth-login

# 3. Work, commit as you go
git add .
git commit -m "T213: add login form and validation"

# 4. Push and open a PR into dev (not main)
git push -u origin feature/T213-auth-login
```

Open the PR on GitHub targeting `dev`. Once reviewed and merged, delete the
feature branch.

### Releasing to main

When `dev` is stable (end of sprint or a working milestone):

```bash
git checkout main
git pull origin main
git merge --no-ff dev
git push origin main
```

## Commit message convention

```
<task-id>: short imperative description

e.g.
T208: set up repo structure and branch protection
T206: add tutor dashboard Figma-to-component scaffold
```

## Issues

Log bugs and blockers as GitHub Issues, tagged with the related Sprint
task ID where possible, so they map back to the sprint report.

## Supervisors

This repo is public so our guide and co-guide can follow progress
without needing collaborator access.

| Role | Name |
|---|---|
| Guide | Mr. Parsu Ram Dhungyel |
| Co-Guide | Mr. Pema Namgay |

Project proposal and weekly sprint reports are in [`docs/`](./docs).

## License

No license has been applied yet — this is a supervised college
capstone project, not intended for external reuse at this stage.
