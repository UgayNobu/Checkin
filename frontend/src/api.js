const BASE = import.meta.env.VITE_API || 'http://localhost:5000/api';
export const FILES = BASE.replace('/api', '');
export const auth = {
  get: () => JSON.parse(localStorage.getItem('checkin') || 'null'),
  set: (v) => localStorage.setItem('checkin', JSON.stringify(v)),
  clear: () => localStorage.removeItem('checkin'),
};
export async function api(path, body, method) {
  const form = body instanceof FormData, headers = { Authorization: 'Bearer ' + (auth.get()?.token || '') };
  if (!form) headers['Content-Type'] = 'application/json';
  const r = await fetch(BASE + path, { method: method || (body ? 'POST' : 'GET'), headers, body: form || !body ? body : JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Something went wrong');
  return d;
}
