import { useEffect, useState } from 'react';
import { api } from '../../api';
import './attendance.css';

// Students only see present (green) or absent (red).
// A flagged check-in stays red until the teacher accepts it.
const show = (s) => (s === 'present' ? 'present' : s ? 'absent' : '');

const WORKSHOP = 'WORKSHOP';
// Which card a live class belongs to
const cardOf = (c) => (c.location?.mode === 'building' ? c.location.building : WORKSHOP);
const minsLeft = (t) => Math.max(0, Math.ceil((new Date(t).getTime() - Date.now()) / 60000));

/** Small outline of the building, drawn from its geojson.io polygon. */
function Outline({ polygons }) {
  const pts = polygons.flat();
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const w = Math.max(...xs) - minX || 1, h = Math.max(...ys) - minY || 1, k = 80 / Math.max(w, h);
  const d = polygons
    .map((ring) => 'M' + ring.map(([x, yy]) => `${((x - minX) * k + (100 - w * k) / 2).toFixed(1)},${((minY + h - yy) * k + (100 - h * k) / 2).toFixed(1)}`).join('L') + 'Z')
    .join(' ');
  return <svg viewBox="0 0 100 100" className="outline" aria-hidden="true"><path d={d} /></svg>;
}

const Pin = () => (
  <svg viewBox="0 0 100 100" className="outline" aria-hidden="true">
    <circle cx="50" cy="50" r="38" className="ring" />
    <path d="M50 22c-11 0-19 8-19 19 0 14 19 35 19 35s19-21 19-35c0-11-8-19-19-19z" />
    <circle cx="50" cy="41" r="7" className="dot" />
  </svg>
);

export default function Attendance() {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [mo, setMo] = useState(new Date());
  const [days, setDays] = useState({});
  const [live, setLive] = useState({ buildings: [], classes: [] });
  const [card, setCard] = useState(null); // 'IT' | 'LT' | 'ACAD' | 'ARCH' | 'WORKSHOP'
  const [pick, setPick] = useState(null); // sessionId of the chosen class

  const y = mo.getFullYear(), m = mo.getMonth(), key = `${y}-${String(m + 1).padStart(2, '0')}`;
  const load = () => api('/attendance/me?month=' + key).then(setDays).catch(() => setDays({}));
  useEffect(() => { load(); }, [key]);

  // Classes open for check-in right now (refreshes every 15 s)
  const loadLive = () => api('/attendance/live').then(setLive).catch(() => {});
  useEffect(() => {
    loadLive();
    const t = setInterval(loadLive, 15000);
    return () => clearInterval(t);
  }, []);

  const cards = [
    ...live.buildings.map((b) => ({ key: b.key, name: b.name, polygons: b.polygons })),
    { key: WORKSHOP, name: 'Workshop / Practical', workshop: true },
  ];
  const classesIn = (k) => live.classes.filter((c) => cardOf(c) === k);
  const here = card ? classesIn(card) : [];
  const chosen = here.find((c) => c.sessionId === pick);

  // A class closed or was checked in: drop the selection
  useEffect(() => {
    if (card && !here.length) { setCard(null); setPick(null); }
    else if (pick && !chosen) setPick(here.length === 1 ? here[0].sessionId : null);
  }, [live]);

  const open = (k) => {
    const list = classesIn(k);
    if (!list.length) return;
    setCard(k);
    setPick(list.length === 1 ? list[0].sessionId : null); // only one class → pick it for them
    setCode('');
    setMsg('');
  };

  // If location fails, the check-in is still sent, so the teacher can review it and decide.
  const send = (extra) =>
    api('/attendance/checkin', { code: code.trim().toUpperCase(), sessionId: pick, ...extra })
      .then((r) => { setMsg(r.message); setCode(''); setCard(null); setPick(null); load(); loadLive(); })
      .catch((e) => setMsg(e.message))
      .finally(() => setBusy(false));

  const checkIn = () => {
    if (!pick) return setMsg('Choose your class first.');
    if (!code.trim()) return setMsg('Enter the check-in code first.');
    setBusy(true);
    setMsg('Getting your location…');

    if (!navigator.geolocation) return send({ locationError: true });

    navigator.geolocation.getCurrentPosition(
      (p) => send({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => send(e.code === 1 ? { permissionDenied: true } : { locationError: true }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const lead = new Date(y, m, 1).getDay(), weeks = Math.ceil((lead + new Date(y, m + 1, 0).getDate()) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => new Date(y, m, 1 - lead + i));

  return (
    <div className="att">
      <div className="record">
        <b>Record Attendance</b>
        <small>Tap the building your class is in. Only buildings where you have a class open right now can be tapped.</small>

        <div className="places">
          {cards.map((c) => {
            const n = classesIn(c.key).length;
            return (
              <button
                key={c.key}
                className={'place' + (card === c.key ? ' on' : '') + (c.workshop ? ' ws' : '')}
                onClick={() => open(c.key)}
                disabled={!n || busy}
                title={n ? `${n} class${n > 1 ? 'es' : ''} open` : 'No class open here for you right now'}
              >
                {c.workshop ? <Pin /> : <Outline polygons={c.polygons} />}
                <span className="pname">{c.name}</span>
                <span className="pinfo">{n ? `${n} class${n > 1 ? 'es' : ''} open` : c.workshop ? 'Uses your live location' : 'No class now'}</span>
              </button>
            );
          })}
        </div>

        {card && (
          <div className="step">
            <small>Choose your class</small>
            <div className="classes">
              {here.map((c) => (
                <button key={c.sessionId} className={'cls' + (pick === c.sessionId ? ' on' : '')} onClick={() => setPick(c.sessionId)} disabled={busy}>
                  <b>{c.module.code} – {c.module.name}</b>
                  <span>
                    {[c.type, c.room, c.tutor].filter(Boolean).join(' · ')}
                    {' · '}{minsLeft(c.expiresAt)} min left
                  </span>
                </button>
              ))}
            </div>

            {chosen && (
              <>
                <small>
                  {chosen.location?.mode === 'workshop'
                    ? `Stay within ${Math.round(chosen.location.radius)} m of your tutor, then enter the code.`
                    : `Be inside the ${chosen.location?.name}, then enter the code.`}
                </small>
                <div className="entry">
                  <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="A1B2C3" autoFocus />
                  <button onClick={checkIn} disabled={busy}>{busy ? 'Checking in…' : 'Check In'}</button>
                </div>
              </>
            )}
          </div>
        )}
        {msg && <p className="msg">{msg}</p>}
      </div>

      <div className="calbox">
        <div className="calhead">
          <button className="nav" onClick={() => setMo(new Date(y, m - 1, 1))}>‹</button>
          <b>{mo.toLocaleString('en', { month: 'long', year: 'numeric' })}</b>
          <button className="nav" onClick={() => setMo(new Date(y, m + 1, 1))}>›</button>
        </div>
        <div className="grid">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => <b key={d}>{d}</b>)}
          {cells.map((c, i) => (
            <div key={i} className={'day ' + (c.getMonth() === m ? show(days[c.getDate()]) : '')}>
              {c.getDate()}
            </div>
          ))}
        </div>
        <div className="legend">
          <span><i className="g" />Present</span>
          <span><i className="r" />Absent</span>
        </div>
      </div>
    </div>
  );
}