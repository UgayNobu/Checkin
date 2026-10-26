// Next.js: the API address comes from NEXT_PUBLIC_API (or the old VITE_API) in frontend/.env or .env.local.
// '/api' also works: next.config.mjs forwards /api to the backend.
const BASE = process.env.NEXT_PUBLIC_API || 'http://localhost:5000/api';
export const FILES = BASE.replace(/\/api$/, '');
/** Link for a file the API returned: full URLs (Supabase) as-is, server paths on the backend. */
export const fileHref = (u) => (!u ? null : /^https?:\/\//.test(u) ? u : FILES + u);

export const auth = {
  get: () => JSON.parse(localStorage.getItem('checkin') || 'null'),
  set: (v) => localStorage.setItem('checkin', JSON.stringify(v)),
  clear: () => localStorage.removeItem('checkin'),
};

// Thin bar at the top of the page while any request is loading, so a short wait
// doesn't look like the app has frozen. Shown only if a request takes over 150 ms.
let pending = 0;
let showTimer = null;

const bar = () =>
  document.getElementById('loadbar') ||
  Object.assign(document.body.appendChild(document.createElement('div')), { id: 'loadbar' });

const loading = (on) => {
  pending = Math.max(0, pending + (on ? 1 : -1));
  if (pending && !showTimer) showTimer = setTimeout(() => bar().classList.add('on'), 150);
  if (!pending) {
    clearTimeout(showTimer);
    showTimer = null;
    bar().classList.remove('on');
  }
};

export async function api(path, body, method) {
  const form = body instanceof FormData;
  const headers = {};
  const token = auth.get()?.token;
  if (token) headers.Authorization = 'Bearer ' + token; // only if we have one; otherwise the cookie is used
  if (!form) headers['Content-Type'] = 'application/json';

  loading(true);
  try {
    const r = await fetch(BASE + path, {
      method: method || (body ? 'POST' : 'GET'),
      headers,
      credentials: 'include', // send the login cookie (checkin_token) with every request
      body: form || !body ? body : JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw Object.assign(new Error(d.error || 'Something went wrong'), { code: d.code, status: r.status });
    return d;
  } finally {
    loading(false);
  }
}
/**
 * Log out everywhere: asks the backend to delete the login cookie (checkin_token),
 * then forgets the saved login in this browser. Clearing only localStorage is not
 * enough, because the browser would keep sending the cookie.
 */
export async function logout() {
  try {
    await api('/auth/logout', {});
  } catch {
    /* backend unreachable: still log out locally */
  } finally {
    auth.clear();
  }
}
