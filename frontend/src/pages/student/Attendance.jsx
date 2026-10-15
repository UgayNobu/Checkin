import { useEffect, useState } from 'react';
import { api } from '../../api';
import './attendance.css';

// Students only see present (green) or absent (red).
// A flagged check-in stays red until the teacher accepts it.
const show = (s) => (s === 'present' ? 'present' : s ? 'absent' : '');

export default function Attendance() {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [mo, setMo] = useState(new Date());
  const [days, setDays] = useState({});

  const y = mo.getFullYear(), m = mo.getMonth(), key = `${y}-${String(m + 1).padStart(2, '0')}`;
  const load = () => api('/attendance/me?month=' + key).then(setDays).catch(() => setDays({}));
  useEffect(() => { load(); }, [key]);

  // If location fails, the check-in is still sent, so the teacher can review it and decide.
  const send = (extra) =>
    api('/attendance/checkin', { code: code.trim().toUpperCase(), ...extra })
      .then((r) => { setMsg(r.message); setCode(''); load(); })
      .catch((e) => setMsg(e.message))
      .finally(() => setBusy(false));

  const checkIn = () => {
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
        <small>Enter the live check-in code shared by your tutor in class</small>
        <div className="entry">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="A1B2C3" />
          <button onClick={checkIn} disabled={busy}>{busy ? 'Checking in…' : 'Check In'}</button>
        </div>
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