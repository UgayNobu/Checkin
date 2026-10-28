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
| Phone layout: menu button + slide-in sidebar, stacked cards, sideways-scrolling tables | `frontend/src/base.css` (section 14), `Shell` in `frontend/src/App.jsx` |
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

Free Render services sleep after 15 minutes without traffic, so the first request
after a break takes about 50 seconds. Open the `/health` link a minute before a demo.

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

Pushing to the deployed branch redeploys both Vercel and Render automatically.
Installed apps pick up the new version the next time they are opened.

The Docker setup (`docs/DEPLOYMENT.md`) is unchanged and serves the same mobile
app. Any server with HTTPS works.
