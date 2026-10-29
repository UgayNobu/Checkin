# Mobile app and free hosting

CheckIn works on phones as an **installable web app (PWA)**: open the link, tap
**Add to Home Screen**, and it gets its own icon and opens full-screen like a normal app.
Android and iPhone both work. There is no app store and nothing separate to build.

```
Phone ──HTTPS──▶ Vercel (frontend, free) ──HTTPS──▶ Render (backend API, free) ──▶ Supabase (database)
```

Phones only allow GPS location on **HTTPS** sites, so check-in only works from the
hosted links below. A `http://192.168.x.x` address from a laptop won't work.

## What makes it mobile

| Piece | Where |
|---|---|
| Phone layout: menu button + slide-in sidebar, stacked cards, sideways-scrolling tables | `frontend/src/vle.css`, `Shell` in `frontend/src/App.jsx` |
| App name, colours, icons | `frontend/photo/manifest.webmanifest`, `frontend/photo/icon-*.png` |
| Offline app shell, never caches API data | `frontend/photo/sw.js` (registered in `src/main.jsx`, built app only) |
| Phone meta tags (iPhone icon, theme colour) | `frontend/index.html` |

## 1. Backend on Render (free)

1. Sign in at <https://render.com> with GitHub.
2. **New → Blueprint**, pick the `Checkin` repo and the branch to deploy. Render reads `render.yaml`.
3. When asked, fill in:
   - `DATABASE_URL`, `DIRECT_URL`: the Supabase values from `backend/.env`.
   - `FRONTEND_URL`: leave as `https://example.com` for now; it's fixed in step 3.
   - `JWT_SECRET` is generated automatically.
4. Wait for the deploy, then open `https://<your-service>.onrender.com/health`. It should show `"status":"ok"`.

### Let GitHub Actions start the deploys

`render.yaml` turns Render's own auto-deploy off. Instead, the `render` job in
`.github/workflows/ci-cd.yml` starts a deploy only after the backend checks, unit
tests, frontend build and Docker smoke test have all passed.

1. Render → your service → **Settings → Deploy Hook** → copy the URL (keep it secret).
2. GitHub → repo **Settings → Secrets and variables → Actions**:
   - **Secrets** tab → **New repository secret**: `RENDER_DEPLOY_HOOK` = the URL.
   - **Variables** tab → **New repository variable**: `RENDER_BRANCH` = the branch Render
     deploys (`dev` while testing; delete it or set `main` for the real release).
3. Push to that branch. In GitHub → **Actions**, the run shows **Deploy backend to Render** at the end.

The branch in Render (**Settings → Branch**) and `RENDER_BRANCH` must be the same.

Free Render services sleep after 15 minutes without traffic, so the first request
after a break takes about 50 seconds. Open the `/health` link a minute before a demo.

### Email on Render (reset codes, alerts)

Render's free plan blocks the email ports (25, 465, 587), so Gmail SMTP cannot send from there. The backend
sends through **Brevo**'s email API over HTTPS instead (free: 300 emails a day):

1. Sign up at <https://www.brevo.com> (free plan).
2. **Senders, domains & dedicated IPs → Senders → Add a sender**: the address emails come from
   (e.g. the team Gmail). Brevo emails a link to that inbox; click it to verify.
3. **SMTP & API → API keys → Generate a new API key**, copy it once.
4. Render → your service → **Environment**: add `BREVO_API_KEY` (the key) and
   `MAIL_FROM` = `CheckIn <the verified address>`. Save; Render restarts.
5. The Render log shows `Email ready: sending via Brevo API as …`. Test with **Forgot password**.

When `BREVO_API_KEY` is set it is used instead of SMTP. On a laptop you can keep using Gmail SMTP.

## 2. Frontend on Vercel (free)

1. Sign in at <https://vercel.com> with GitHub. **Add New → Project**, import `Checkin`.
2. **Root Directory:** `frontend`. Vercel detects Vite automatically.
3. **Environment Variables:** `VITE_API` = `https://<your-service>.onrender.com/api`
4. **Deploy.** You get a link like `https://checkin-cst.vercel.app`.

## 3. Connect the two

In Render → your service → **Environment**, set `FRONTEND_URL` to the Vercel link
(no slash at the end) and save. Render restarts the backend, and from then on it
accepts logins from that site.

## 4. Install on a phone

- **Android (Chrome):** open the Vercel link, then tap **Install app** (or ⋮ → **Add to Home screen**).
- **iPhone (Safari):** open the link, tap **Share** → **Add to Home Screen**.

On the first check-in, allow location access when the phone asks.

## Updating

Pushing to the deployed branch redeploys Vercel straight away, and Render once the GitHub Actions checks pass.
Installed apps pick up the new version the next time they are opened.

The Docker setup (`docs/DEPLOYMENT.md`) is unchanged and serves the same mobile
app. Any server with HTTPS works.
