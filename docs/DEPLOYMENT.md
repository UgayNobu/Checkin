# Docker, CI/CD and deployment

This guide covers three things:

1. **Run the whole app in Docker** on your own machine (no Node or Supabase needed).
2. **The CI/CD pipeline**: what GitHub checks on every pull request, and how images are published.
3. **Deploying to a server**: one-time setup, then automatic deploys on every merge to `main`.

## How the pieces fit

```
                 browser
                    │  http://host:8080
            ┌───────▼────────┐
            │   frontend     │  nginx: serves the React build,
            │ (nginx:alpine) │  forwards /api and /uploads ──┐
            └────────────────┘                               │
                                                     ┌───────▼───────┐
                                                     │    backend    │ Node 22, Express, Prisma
                                                     │  (port 5000)  │ uploads → volume
                                                     └───────┬───────┘
                         local / CI: postgres container ◄────┤
                         production: Supabase        ◄───────┘
```

| File | Purpose |
|---|---|
| `backend/Dockerfile` | Multi-stage build. `runtime` target = production API image (non-root, healthcheck). `dbsetup` target = one-off job that builds a local database. |
| `backend/docker/` | Local-database scripts: `gen_id()` + ID sequences, `prisma db push`, Supabase-only columns, seed, test passwords. |
| `frontend/Dockerfile` | Builds the Vite app, serves it with nginx. |
| `frontend/nginx.conf` | Serves the SPA, proxies `/api` + `/uploads` to the backend, 10 MB uploads, asset caching. |
| `docker-compose.yml` | Local/CI stack: Postgres + db-setup + backend + frontend. |
| `docker-compose.prod.yml` | Production: backend + frontend from GHCR images, Supabase database. |
| `.github/workflows/ci-cd.yml` | The pipeline. |
| `scripts/smoke-test.sh` | End-to-end check used by CI (and by you). |

---

## 1. Run locally with Docker

**Prerequisite:** [Docker Desktop](https://www.docker.com/products/docker-desktop/), running.

```bash
cp .env.example .env
# open .env and set JWT_SECRET to a long random string, e.g. the output of:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

docker compose up -d --build
```

Open **http://localhost:8080** and log in as `CST-ICT01` / `Test@1234` (other test accounts are in the README).

The first start takes a few minutes. The `db-setup` container creates the tables and loads the seed data, then exits. That is expected: it shows as `Exited (0)`.

| Task | Command |
|---|---|
| See what's running | `docker compose ps -a` |
| Follow the logs | `docker compose logs -f backend` |
| Rebuild after code changes | `docker compose up -d --build` |
| Stop (keeps data) | `docker compose down` |
| **Reset the database** (e.g. after changing `schema.prisma` or `database.sql`) | `docker compose down -v` then `docker compose up -d --build` |
| Run the smoke test | `sh scripts/smoke-test.sh http://localhost:8080` |
| Open a SQL shell | `docker compose exec db psql -U checkin_user -d checkin_db` |

**Port 8080 already in use?** Add `APP_PORT=8088` to `.env` (or any free port).

**Testing check-in from a phone:** browsers only allow location access on `https://` or `localhost`, so `http://<your-laptop-ip>:8080` will block it. Use the deployed HTTPS site for phone tests.

### How the local database is built

The real schema lives in Supabase. `database.sql` only holds *changes* to it, so it can't build a database from nothing. On an empty database, `backend/docker/db-setup.sh` does this:

1. `db-bootstrap.sql`: creates the `gen_id()` and `current_academic_session()` functions and the `seq_*` sequences that the table defaults use (`gen_id('CC','seq_class_changes')` → `CC001`).
2. `prisma db push`: creates the tables from `schema.prisma`.
3. `db-after-push.sql`: adds the current semester (AS2026) and the partial unique indexes Prisma can't describe.
4. `node seed.js`: loads the seed data from `database.sql`.
5. `scripts/set-test-passwords.js`: sets every seeded account's password to `Test@1234`.

On later starts it only re-runs the seed (which skips existing rows). The script **refuses to run if `DATABASE_URL` points at Supabase**.

> If a future `database.sql` change adds a Supabase column that the seed uses but `schema.prisma` doesn't have, `db-setup` will fail with `column "…" does not exist`. Add that column to `backend/docker/db-after-push.sql`, or better, add it to `schema.prisma`.

---

## 2. The CI/CD pipeline

`.github/workflows/ci-cd.yml` runs on every pull request into `dev`/`main` and on every push to `dev`/`main`.

| Job | Runs on | What it does |
|---|---|---|
| **Backend checks** | PRs + pushes | `npm ci`, `prisma validate`, `prisma generate`, syntax-check all JS, `npm audit` (fails only on critical issues) |
| **Frontend build** | PRs + pushes | `npm ci`, `npm run build` |
| **Docker build + smoke test** | PRs + pushes | Builds every image, starts the full stack with a fresh database, then runs `scripts/smoke-test.sh`: loads the app, checks SPA routing, logs in through nginx, makes an authenticated call, and checks that an unauthenticated one gets 401. Prints container logs if anything fails. |
| **Publish images** | pushes to `dev`/`main`, `v*` tags | Pushes `checkin-backend` and `checkin-frontend` to GitHub Container Registry |
| **Deploy to server** | pushes to `main`, if configured | SSHes to your server and rolls out the new images (section 3) |

Image tags in `ghcr.io/ugaynobu/checkin-backend` (same for frontend):

| Tag | Meaning |
|---|---|
| `dev`, `main` | latest build of that branch |
| `sha-abc1234` | an exact commit (what the deploy job uses, so rollbacks are precise) |
| `latest` | latest `main` |
| `1.2.0` | from pushing a git tag `v1.2.0` |

### One-time GitHub setup

1. **Actions permissions.** Go to *Settings → Actions → General → Workflow permissions* and make sure "Read and write permissions" is allowed, or leave the default. The workflow asks for `packages: write` itself.
2. **Branch protection** (recommended). Go to *Settings → Branches* and edit the rule for `dev` and `main`. Tick *Require status checks to pass* and select **Backend checks**, **Frontend build** and **Docker build + smoke test**. They show up in the list after the workflow has run once.
3. **Package visibility.** After the first push to `dev`, open the repo owner's profile → *Packages*. You'll see `checkin-backend` and `checkin-frontend`. They start out private. Making them public (*Package settings → Change visibility*) lets anyone `docker pull` them. If you keep them private, the deploy job still works because it logs in with the workflow token.

---

## 3. Deploying to a server

Production uses the **shared Supabase database** and the images built by CI. There's no database container, and nothing runs `prisma db push` or migrations. Schema changes still go through `database.sql`, applied by Dechen in the Supabase SQL editor.

### Server requirements

- Any Linux VM (Ubuntu 22.04/24.04 is fine) with 1 GB RAM or more, reachable over SSH
- Docker Engine + Compose plugin: `curl -fsSL https://get.docker.com | sh`
- Outbound access to Supabase (ports 5432/6543)

### One-time server setup

```bash
# on the server, as the user GitHub will deploy as
sudo usermod -aG docker $USER      # then log out and back in
mkdir -p ~/checkin && cd ~/checkin
nano backend.env                   # contents below; never commit this file
chmod 600 backend.env
```

`backend.env` takes the same values as `backend/.env` (ask Dechen for the real ones). Leave out `PORT`: the compose file sets it.

```env
DATABASE_URL="postgresql://USER:PASSWORD@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://USER:PASSWORD@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
JWT_SECRET="a-long-random-string-different-from-dev"
GEOFENCE_METRES=10
```

Create an SSH key just for deploys. Run this on your laptop, not the server:

```bash
ssh-keygen -t ed25519 -f checkin_deploy -N "" -C "github-deploy"
ssh-copy-id -i checkin_deploy.pub USER@SERVER     # or append the .pub to ~/.ssh/authorized_keys on the server
```

### One-time GitHub setup for deploys

In the repo: *Settings → Environments → New environment* → name it **`production`**. Optionally add *Required reviewers* so every deploy needs a click to approve. Then add:

| Kind | Name | Value |
|---|---|---|
| Secret | `DEPLOY_SSH_KEY` | the full contents of the private key file `checkin_deploy` |
| Variable | `DEPLOY_HOST` | server IP or hostname |
| Variable | `DEPLOY_USER` | SSH user on the server |
| Variable | `DEPLOY_PATH` | *(optional)* folder holding `backend.env`, default `checkin` (relative to the user's home) |
| Variable | `DEPLOY_PORT` | *(optional)* SSH port, default `22` |

Put the variables under *Settings → Secrets and variables → Actions → Variables* (repository level). The deploy job is **skipped while `DEPLOY_HOST` is empty**, so the pipeline works without a server.

From then on, every merge into `main` builds, tests, publishes and deploys. The site is served on port 80 of the server.

### HTTPS (required for check-in)

Browsers block location access on plain `http://`, so students can't check in without HTTPS. The simplest fix is to run [Caddy](https://caddyserver.com/) on the server. It gets free certificates automatically:

1. Point a domain (e.g. `checkin.example.com`) at the server.
2. In `~/checkin/.env` on the server, set `APP_PORT=8080` so the app moves off port 80.
3. Install Caddy (`sudo apt install caddy`) and put this in `/etc/caddy/Caddyfile`:
   ```
   checkin.example.com {
       reverse_proxy localhost:8080
   }
   ```
4. `sudo systemctl reload caddy`

### Manual deploy and rollback

```bash
cd ~/checkin
docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d

# roll back to an earlier commit (any sha-… tag from the Packages page)
IMAGE_TAG=sha-abc1234 docker compose -f docker-compose.prod.yml up -d
```

If the packages are private, run `docker login ghcr.io` first, using a GitHub personal access token with the `read:packages` scope.

Uploaded files live in the `uploads_data` Docker volume and survive redeploys. Back them up with:

```bash
docker run --rm -v checkin_uploads_data:/data -v "$PWD":/backup alpine tar czf /backup/uploads.tgz -C /data .
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Set JWT_SECRET in .env` | Create `.env` from `.env.example` in the repo root. |
| `ports are not available … 8080` | Something else uses 8080. Set `APP_PORT=8088` in `.env`. |
| `db-setup didn't complete successfully` | `docker compose logs db-setup`. Usually a column the seed needs (see section 1), or old data, which `docker compose down -v` fixes. |
| Login says *Wrong ID or password* locally | The database was created before test passwords were set. Run `docker compose down -v` and start again. |
| Frontend build fails in Docker/CI but works on Windows | Linux paths are case-sensitive. Check that import paths match the folder's case exactly (`photo/`, not `Photo/`). |
| `502 Bad Gateway` on `/api` | The backend is down or still starting. Run `docker compose ps` and `docker compose logs backend`. |
| Deploy job: `Permission denied (publickey)` | `DEPLOY_SSH_KEY` must be the **private** key, and the matching `.pub` must be in the server's `authorized_keys`. |
| Deploy job: `denied` pulling from ghcr.io | The package isn't linked to the repo. Go to *Package settings → Manage Actions access* and add the `Checkin` repo with read access. |
