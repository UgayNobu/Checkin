// Phone location for check-in.
//
// Why phones were less accurate than laptops: indoors a phone's first reading usually comes
// from Wi-Fi or cell towers (often 50–500 m off), and real GPS needs 10–30 seconds to lock on.
// So the location is started early (as soon as the student taps their building, or the tutor
// chooses Workshop), keeps improving while they pick the class and type the code, and by the
// time they press the button it is usually already good.
//
// Readings from the last few seconds are averaged (better readings count more), which smooths
// out the jumps a phone's position makes from second to second.
import { useEffect, useState } from 'react';

const KEEP_MS = 20000;      // readings older than this are forgotten
const FUSE_MS = 12000;      // readings averaged together are from the last 12 s
const PRECISE_OFF_M = 1000; // worse than this: "Precise location" is probably switched off

let readings = [];
let watchId = null;
let lastError = null;
const subscribers = new Set();

/**
 * Combine recent readings into one position.
 * Only readings close in quality to the best one are used, weighted by 1/accuracy²
 * (a reading twice as precise counts four times as much). The accuracy reported is the
 * best single reading's, so the server never sees a more optimistic figure than the phone gave.
 */
export function fuse(list, now = Date.now()) {
  const recent = list.filter((r) => now - r.t <= FUSE_MS);
  if (!recent.length) return null;
  const best = recent.reduce((a, b) => (b.accuracy < a.accuracy ? b : a));
  const use = recent.filter((r) => r.accuracy <= best.accuracy * 1.5);
  let w = 0, lat = 0, lng = 0;
  for (const r of use) {
    const k = 1 / Math.max(r.accuracy, 1) ** 2;
    w += k; lat += r.lat * k; lng += r.lng * k;
  }
  return { lat: lat / w, lng: lng / w, accuracy: best.accuracy, samples: use.length };
}

/** A short description of how good the location is, for showing to the user. */
export function describe(fix, error) {
  if (error?.code === 1) return { level: 'bad', text: 'Location is blocked. Allow location for this site in your browser settings, then try again.' };
  if (!fix) return { level: 'wait', text: error ? 'Still looking for your location…' : 'Finding your location…' };
  const m = Math.round(fix.accuracy);
  if (fix.accuracy >= PRECISE_OFF_M) return { level: 'bad', text: `Only an approximate location (±${m} m). Turn on Precise Location for your browser in the phone's settings.` };
  if (fix.accuracy > 50) return { level: 'weak', text: `Location ±${m} m and improving… Turn on Wi-Fi and stand near a window or door for a faster fix.` };
  return { level: 'good', text: `Location ready (±${m} m)` };
}

function emit() {
  subscribers.forEach((f) => f());
}

function start() {
  if (watchId !== null || !navigator.geolocation) return;
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      const now = Date.now();
      readings = readings.filter((r) => now - r.t <= KEEP_MS);
      readings.push({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, t: now });
      lastError = null;
      emit();
    },
    (e) => {
      lastError = e;
      emit();
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
  );
}

function stop() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  readings = [];
  lastError = null;
}

/** Listen for location updates; the location runs while anyone is listening. Returns an unsubscribe function. */
function subscribe(fn) {
  subscribers.add(fn);
  start();
  return () => {
    subscribers.delete(fn);
    if (!subscribers.size) stop();
  };
}

export const currentFix = () => fuse(readings);

/**
 * Starts the location while `on` is true, so it has time to improve before it is needed.
 * Returns { fix, status } where status is from describe().
 */
export function useLocationWarmup(on) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!on || !navigator.geolocation) return undefined;
    return subscribe(() => tick((n) => n + 1));
  }, [on]);
  const fix = on ? currentFix() : null;
  return { fix, status: on ? describe(fix, lastError) : null };
}

/**
 * The best location available: straight away if the warmed-up location is already good,
 * otherwise waits up to `maxWait` ms for it to improve.
 * Resolves { lat, lng, accuracy }; rejects with the browser's error (e.code 1 = permission denied).
 */
export function bestPosition({ good = 20, maxWait = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject({ code: 0, message: 'No location on this device' });
    let off = null, timer = null, done = false;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const fix = currentFix(), err = lastError;
      if (off) off();
      if (fix) resolve({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy });
      else reject(err || { code: 3, message: 'Location timed out' });
    };
    const check = () => {
      if (done) return;
      if (lastError?.code === 1) return finish(); // permission denied: stop now
      const fix = currentFix();
      if (fix && fix.accuracy <= good) finish();
    };

    off = subscribe(check);
    timer = setTimeout(finish, maxWait);
    check();
  });
}
