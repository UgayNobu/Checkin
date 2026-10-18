// Best location within a few seconds.
// A phone's first reading indoors often comes from Wi-Fi or cell towers (100 m or worse);
// real GPS arrives a few seconds later. So we watch the position for up to `maxWait` ms
// and keep the most accurate reading, stopping early once it is good enough.
// Resolves { lat, lng, accuracy }; rejects with the browser's error (e.code 1 = permission denied).
export function bestPosition({ good = 20, maxWait = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject({ code: 0, message: 'No location on this device' });
    let best = null, id = null, timer = null, done = false;

    const finish = (err) => {
      if (done) return;
      done = true;
      if (id !== null) navigator.geolocation.clearWatch(id);
      clearTimeout(timer);
      if (best) resolve(best);
      else reject(err || { code: 3, message: 'Location timed out' });
    };

    id = navigator.geolocation.watchPosition(
      (p) => {
        const r = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        if (!best || r.accuracy < best.accuracy) best = r;
        if (best.accuracy <= good) finish();
      },
      (e) => (e.code === 1 || !best ? finish(e) : null), // permission denied → stop; otherwise keep waiting
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxWait }
    );
    timer = setTimeout(() => finish(), maxWait);
  });
}
