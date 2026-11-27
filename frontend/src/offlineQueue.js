// Check-ins saved on the phone while there was no internet (top floors, weak data).
// Each one keeps the time it was made (savedAt); the server accepts it until the class ends if the
// code was valid at that moment, and flags it for the tutor. Sending is tried on every student
// page (App.jsx), whenever the phone comes back online and every 20 seconds.
import { api } from './api';
import { toast } from './motion';

const KEY = 'checkin_offline_queue';
export const readQueue = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch { return []; } };
const writeQueue = (q) => {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* private mode */ }
  window.dispatchEvent(new Event('checkin-queue')); // the Attendance page updates its "waiting" note
};

/** Keep one check-in to send later (one per class). */
export function saveCheckIn(payload) {
  writeQueue([...readQueue().filter((x) => x.sessionId !== payload.sessionId), { ...payload, offline: true, savedAt: new Date().toISOString() }]);
}

let sending = false;
/** Try to send every saved check-in; keeps the ones that still can't reach the server. */
export async function flushQueue(onSent) {
  if (sending || !navigator.onLine || !readQueue().length) return;
  sending = true;
  try {
    for (const item of readQueue()) {
      try {
        const r = await api('/attendance/checkin', item);
        toast(r.message || 'Your saved check-in was sent to your tutor', 'info');
        onSent?.(r);
      } catch (e) {
        if (!e.status) continue; // still no connection: keep it for next time
        toast(`Your saved check-in was not accepted: ${e.message}`, 'bad');
      }
      writeQueue(readQueue().filter((x) => x.savedAt !== item.savedAt));
    }
  } finally {
    sending = false;
  }
}
