import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';

const WINDOW_MIN = 5; // check-in window in minutes

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function StartAttendance() {
  const [mods, setMods] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [f, setF] = useState({ module: '', room: '', type: 'theory', hours: 1 });
  const [sid, setSid] = useState(null);
  const [live, setLive] = useState(null);
  const [ends, setEnds] = useState(null);
  const [left, setLeft] = useState(0);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const [slot, setSlot] = useState(null); // timetable class this session was started from

  // Only modules the admin assigned to this teacher
  useEffect(() => {
    api('/teacher/modules')
      .then((r) => setMods(Array.isArray(r) ? r : []))
      .catch(() => setMods([]))
      .finally(() => setLoaded(true));
  }, []);

  // Opened from the Timetable ("Start attendance"): fill the form from that class
  useEffect(() => {
    const id = params.get('slot');
    if (!id) return;
    api('/teacher/timetable')
      .then((list) => {
        const x = (Array.isArray(list) ? list : []).find((s) => s.id === id);
        if (!x || !x.teaches) return;
        const [sh, sm] = x.start.split(':').map(Number), [eh, em] = x.end.split(':').map(Number);
        const hours = Math.max(1, Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60));
        setSlot(x);
        setF({ module: x.module.id, room: x.room?.name || '', type: x.type === 'practical' ? 'practical' : 'theory', hours });
      })
      .catch(() => {});
  }, [params]);

  // Countdown
  useEffect(() => {
    if (!ends) return;
    const tick = () => setLeft(Math.max(0, Math.round((ends - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [ends]);

  const open = sid && left > 0;
  const closed = sid && ends && left === 0;

  // Live counts: poll while open, fetch once more when it closes
  useEffect(() => {
    if (!sid) return;
    const load = () => api(`/sessions/${sid}/live`).then(setLive).catch(() => {});
    load();
    if (!open) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [sid, open]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const gen = () => {
    if (!f.module) return setMsg('Please select a module.');
    if (!navigator.geolocation) return setMsg('Location is not supported on this browser.');

    setBusy(true);
    setMsg('Getting your location…');

    navigator.geolocation.getCurrentPosition(
      (p) =>
        api('/sessions', {
          ...f,
          ...(slot && f.module === slot.module.id && { slot: slot.id }),
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
          durationMinutes: WINDOW_MIN,
        })
          .then((s) => {
            setLive(null);
            setSid(s._id || s.id);
            setEnds(s.expiresAt ? new Date(s.expiresAt).getTime() : Date.now() + WINDOW_MIN * 60000);
            setMsg('');
          })
          .catch((x) => setMsg(x.message))
          .finally(() => setBusy(false)),
      (e) => {
        setBusy(false);
        setMsg(
          e.code === 1
            ? 'Allow location access to start a session.'
            : 'Could not get your location. Please try again.'
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const reset = () => {
    setSid(null);
    setLive(null);
    setEnds(null);
    setLeft(0);
    setMsg('');
  };

  const noMods = loaded && mods.length === 0;

  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      {/* Session details */}
      <div className="panel" style={{ flex: 1, marginTop: 0 }}>
        <h3>Session details</h3>
        {slot && (
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#2f6df0' }}>
            From your timetable: {slot.day} {slot.start}–{slot.end}{slot.group ? ` · Group ${slot.group}` : ''}
          </p>
        )}

        <label>Module</label>
        <select value={f.module} onChange={set('module')} disabled={open || noMods}>
          {noMods ? (
            <option value="">No modules assigned. Contact admin.</option>
          ) : (
            <>
              <option value="">Select module</option>
              {mods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} – {m.name}
                </option>
              ))}
            </>
          )}
        </select>

        <label>Room</label>
        <input value={f.room} onChange={set('room')} disabled={open} />

        <label>Practical / theory</label>
        <select value={f.type} onChange={set('type')} disabled={open}>
          <option>theory</option>
          <option>practical</option>
        </select>

        <label>Total hour</label>
        <input type="number" min="1" value={f.hours} onChange={set('hours')} disabled={open} />

        <p>
          <small>
            Students have {WINDOW_MIN} minutes to check in. Anyone who doesn't is marked absent.
          </small>
        </p>
        {msg && <p className="err">{msg}</p>}

        {closed ? (
          <button className="btn" style={{ width: '100%' }} onClick={reset}>
            Start new session
          </button>
        ) : (
          <button
            className="btn"
            style={{ width: '100%' }}
            onClick={gen}
            disabled={busy || open || noMods}
          >
            {busy ? 'Starting…' : open ? 'Session running…' : 'Generate Check-in Code'}
          </button>
        )}
      </div>

      {/* Live code panel */}
      {sid && (
        <div className="panel" style={{ flex: 1, marginTop: 0, textAlign: 'center' }}>
          {open ? (
            <>
              <h2 style={{ fontSize: 40, letterSpacing: 6, margin: '8px 0' }}>{live?.code || '……'}</h2>
              <p style={{ fontSize: 22, fontWeight: 700, color: left <= 60 ? '#ef4444' : '#2f6df0', margin: 0 }}>
                {mmss(left)}
              </p>
              <small>Students enter this code in the CheckIn app before the timer runs out.</small>
            </>
          ) : (
            <>
              <h3 style={{ margin: '8px 0' }}>Check-in window closed</h3>
              <small>Students who didn't check in are marked absent.</small>
            </>
          )}

          {live && (
            <div className="row" style={{ justifyContent: 'center', gap: 36, marginTop: 16 }}>
              <div>
                <b className="ok" style={{ fontSize: 22 }}>{live.checkedIn ?? 0}</b>
                <br />
                <small>Present</small>
              </div>
              <div>
                <b className="err" style={{ fontSize: 22 }}>{live.absent ?? 0}</b>
                <br />
                <small>Absent</small>
              </div>
              <div>
                <b style={{ fontSize: 22, color: '#d97706' }}>{live.flagged?.length ?? 0}</b>
                <br />
                <small>Flagged</small>
              </div>
            </div>
          )}

          {live?.flagged?.length > 0 && (
            <div style={{ marginTop: 14, textAlign: 'left' }}>
              <small><b>Flagged for review:</b></small>
              {live.flagged.map((s) => (
                <p key={s.id || s.name} style={{ margin: '4px 0', fontSize: 12, color: '#b45309' }}>
                  ⚑ {s.name}{s.reason ? ` (${s.reason})` : ''}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}