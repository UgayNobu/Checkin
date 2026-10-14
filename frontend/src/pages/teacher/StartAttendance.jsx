import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';

const WINDOW_MIN = 2; // check-in window in minutes

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Today's date, e.g. "Wednesday, October 14, 2026"
const todayText = () =>
  new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

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
  const [showFlags, setShowFlags] = useState(false); // flagged list open?
  const [deciding, setDeciding] = useState(null); // attendanceId being saved
  const endedFor = useRef(null); // session we already closed

  // Only modules the admin assigned to this teacher
  useEffect(() => {
    api('/teacher/modules')
      .then((r) => setMods(Array.isArray(r) ? r : []))
      .catch(() => setMods([]))
      .finally(() => setLoaded(true));
  }, []);

  // Coming back to this page: restore a session that is still running
  useEffect(() => {
    api('/sessions/mine?status=ongoing&limit=1')
      .then(async (list) => {
        const se = Array.isArray(list) ? list[0] : null;
        if (!se) return;
        const l = await api(`/sessions/${se._id}/live`);
        const end = l?.expiresAt ? new Date(l.expiresAt).getTime() : 0;
        if (end > Date.now()) {
          setSid(se._id);
          setEnds(end);
          setLive(l);
          setF((x) => ({ ...x, module: se.module?.id || '', room: se.room || '', type: se.type || 'theory', hours: se.hours || 1 }));
        }
      })
      .catch(() => {});
  }, []);

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

  const loadLive = () => sid && api(`/sessions/${sid}/live`).then(setLive).catch(() => {});

  // Live counts: poll while open
  useEffect(() => {
    if (!sid) return;
    loadLive();
    if (!open) return;
    const t = setInterval(loadLive, 4000);
    return () => clearInterval(t);
  }, [sid, open]);

  // Time's up: close the session now, so undecided flagged students become Absent straight away
  useEffect(() => {
    if (!closed || endedFor.current === sid) return;
    endedFor.current = sid;
    api(`/sessions/${sid}/end`, {}).catch(() => {}).finally(loadLive);
  }, [closed, sid]);

  // Teacher decides a flagged student: Present (accept) or Absent (reject)
  const decide = (s, present) => {
    const aid = s.attendanceId || s.id;
    setDeciding(aid);
    api(`/sessions/${sid}/flagged/${aid}/${present ? 'accept' : 'reject'}`, {})
      .then(loadLive)
      .catch((e) => setMsg(e.message))
      .finally(() => setDeciding(null));
  };

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
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
          minutes: WINDOW_MIN,
        })
          .then((s) => {
            setLive(null);
            setShowFlags(false);
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
    setShowFlags(false);
  };

  const noMods = loaded && mods.length === 0;
  const flagged = live?.flagged || [];

  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      {/* Session details */}
      <div className="panel" style={{ flex: 1, marginTop: 0 }}>
        <h3>Session details</h3>

        <label>Date</label>
        <input value={todayText()} readOnly disabled />

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
            Students have {WINDOW_MIN} minutes to check in. Flagged students must be decided before the
            timer ends, or they are marked absent.
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
          <small style={{ display: 'block', color: '#6b7280', marginBottom: 4 }}>{todayText()}</small>

          {open ? (
            <>
              <h2 style={{ fontSize: 40, letterSpacing: 6, margin: '8px 0' }}>{live?.code || '……'}</h2>
              <p style={{ fontSize: 22, fontWeight: 700, color: left <= 30 ? '#ef4444' : '#2f6df0', margin: 0 }}>
                {mmss(left)}
              </p>
              <small>Students enter this code in the CheckIn app before the timer runs out.</small>
            </>
          ) : (
            <>
              <h3 style={{ margin: '8px 0' }}>Check-in window closed</h3>
              <small>Students who didn't check in, and flagged students not decided, are marked absent.</small>
            </>
          )}

          {live && (
            <div className="row" style={{ justifyContent: 'center', gap: 48, marginTop: 16 }}>
              <div>
                <b className="ok" style={{ fontSize: 22 }}>{live.checkedIn ?? 0}</b>
                <br />
                <small>Present</small>
              </div>

              {/* Flagged: click to see who and decide */}
              <button
                onClick={() => setShowFlags(!showFlags)}
                disabled={!flagged.length}
                title={flagged.length ? 'Click to see flagged students' : 'No flagged students'}
                style={{
                  background: showFlags ? '#fef3c7' : 'none',
                  border: flagged.length ? '1px solid #f59e0b' : '1px solid transparent',
                  borderRadius: 10,
                  padding: '4px 14px',
                  cursor: flagged.length ? 'pointer' : 'default',
                  font: 'inherit',
                }}
              >
                <b style={{ fontSize: 22, color: '#d97706' }}>{flagged.length}</b>
                <br />
                <small>Flagged {flagged.length > 0 && (showFlags ? '▲' : '▼')}</small>
              </button>
            </div>
          )}

          {/* Flagged students: teacher decides Present or Absent */}
          {showFlags && flagged.length > 0 && (
            <div style={{ marginTop: 16, textAlign: 'left', borderTop: '1px solid #eee', paddingTop: 12 }}>
              <small style={{ color: '#6b7280' }}>
                {open
                  ? 'Ask the student, then mark them. Anyone not decided before the timer ends becomes absent.'
                  : 'The window has closed.'}
              </small>
              {flagged.map((s) => {
                const aid = s.attendanceId || s.id;
                return (
                  <div
                    key={aid || s.name}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 0',
                      borderBottom: '1px solid #f1f1f1',
                    }}
                  >
                    <div>
                      <b style={{ fontSize: 14 }}>{s.name}</b>
                      <br />
                      <small style={{ color: '#b45309' }}>⚑ {s.reason || 'Weak GPS accuracy'}</small>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => decide(s, true)}
                        disabled={!open || deciding === aid}
                        style={{ padding: '6px 14px', background: '#059669', color: '#fff', border: 0, borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Present
                      </button>
                      <button
                        onClick={() => decide(s, false)}
                        disabled={!open || deciding === aid}
                        style={{ padding: '6px 14px', background: '#fff', color: '#dc2626', border: '1px solid #dc2626', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Absent
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}