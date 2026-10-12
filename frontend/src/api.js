const BASE = import.meta.env.VITE_API || 'http://localhost:5000/api';
export const FILES = BASE.replace('/api', '');
export const auth = {
  get: () => JSON.parse(localStorage.getItem('checkin') || 'null'),
  set: (v) => localStorage.setItem('checkin', JSON.stringify(v)),
  clear: () => localStorage.removeItem('checkin'),
};
// Thin bar at the top of the page while any request is loading, so a short wait
// doesn't look like the app has frozen. Shown only if a request takes over 150 ms.
let pending = 0, showTimer = null;
const bar = () => document.getElementById('loadbar') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'loadbar' });
const loading = (on) => {
  pending = Math.max(0, pending + (on ? 1 : -1));
  if (pending && !showTimer) showTimer = setTimeout(() => bar().classList.add('on'), 150);
  if (!pending) { clearTimeout(showTimer); showTimer = null; bar().classList.remove('on'); }
};

export async function api(path, body, method) {
  const form = body instanceof FormData, headers = { Authorization: 'Bearer ' + (auth.get()?.token || '') };
  if (!form) headers['Content-Type'] = 'application/json';
  loading(true);
  try {
    const r = await fetch(BASE + path, { method: method || (body ? 'POST' : 'GET'), headers, body: form || !body ? body : JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Something went wrong');
    return d;
  } finally {
    loading(false);
  }
}
