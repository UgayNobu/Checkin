// Times are stored and sent as 24-hour 'HH:MM'; people read them in 12-hour time.
/** '13:50' → '1:50 PM'; anything that isn't 'HH:MM' is returned unchanged. */
export function t12(s) {
  const m = /^(\d{1,2}):(\d{2})/.exec(s || '');
  if (!m) return s || '';
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** '13:00', '14:00' → '1:00 PM – 2:00 PM' */
export const span12 = (a, b) => `${t12(a)} – ${t12(b)}`;
