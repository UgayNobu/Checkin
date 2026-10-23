import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { bestPosition } from '../../geo';
import './startform.css';

const WINDOW_MIN = 2; // students have 2 minutes to check in (short, so codes can't be passed around)
const REVIEW_MIN = 3; // then the tutor has 3 more minutes to decide flagged students (REVIEW_MINUTES on the server)

// Same matching as the backend (config/buildings.js): "ITL06", "itl-6", "CR3", "Drawing Studio 2" …
const squash = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const roomKey = (t) => {
  const m = squash(t).match(/^(ITL|IT|CR|LT|DS|DRAWINGSTUDIO|STUDIO)(\d+)$/);
  return m ? `${/STUDIO/.test(m[1]) ? 'DS' : m[1]}|${Number(m[2])}` : null;
};
const buildingOfRoom = (room, buildings) =>
  buildings.find((b) => b.rooms?.some((r) => (roomKey(r.name) && roomKey(r.name) === roomKey(room)) || (r.label && squash(r.label) === squash(room))));

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Today's date, e.g. "Wednesday, October 14, 2026"
const todayText = () =>
  new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export default function StartAttendance() {
  const [mods, setMods] = useState([]);
  const [loaded, setLoaded] = useState(false);
  // where: 'IT' | 'LT' | 'ACAD' | 'ARCH' = students must be inside that building; 'WORKSHOP' = within radius of me
  const [f, setF] = useState({ module: '', room: '', type: 'theory', hours: 1, where: '', radius: 30 });
  const [buildings, setBuildings] = useState([]);
  const [sid, setSid] = useState(null);
  const [live, setLive] = useState(null);
  const [ends, setEnds] = useState(null);
  const [, setTick] = useState(0); // re-renders the countdowns every second
  const [closes, setCloses] = useState(null); // when the review time ends (ms)
  const [liveAt, setLiveAt] = useState(0); // when the live counts were last loaded
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [showFlags, setShowFlags] = useState(false); // flagged list open?
  const [deciding, setDeciding] = useState(null); // attendanceId being saved
  const endedFor = useRef(null); // session we already closed
  const [params] = useSearchParams();
  const [slot, setSlot] = useState(null); // timetable class this session was started from
  const [chg, setChg] = useState(null); // extra class, or a class this tutor is covering
  const [notNow, setNotNow] = useState(false); // the server said it isn't class time
  const nav = useNavigate();
  // Only modules the admin assigned to this teacher
  useEffect(() => {
    api('/teacher/modules')
      .then((r) => setMods(Array.isArray(r) ? r : []))
      .catch(() => setMods([]))
      .finally(() => setLoaded(true));
  }, []);

  // Campus buildings for the location picker
  useEffect(() => { api('/sessions/buildings').then((b) => setBuildings(Array.isArray(b) ? b : [])).catch(() => {}); }, []);

  // Coming back to this page: restore a session that is still running
  useEffect(() => {
    api('/sessions/mine?status=ongoing&limit=1')
      .then(async (list) => {
        const se = Array.isArray(list) ? list[0] : null;
        if (!se) return;
        const l = await api(`/sessions/${se._id}/live`);
        const end = l?.expiresAt ? new Date(l.expiresAt).getTime() : 0;
        const close = l?.closesAt ? new Date(l.closesAt).getTime() : end + REVIEW_MIN * 60000;
        if (close > Date.now()) { // still checking in, or still in the review time
          setSid(se._id);
          setEnds(end);
          setCloses(close);
          setLive(l);
          setF((x) => ({ ...x, module: se.module?.id || '', room: se.room || '', type: se.type || 'theory', hours: se.hours || 1 }));
        }
      })
      .catch(() => {});
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
        setF((o) => ({ ...o, module: x.module.id, room: x.room?.name || '', type: x.type === 'practical' ? 'practical' : 'theory', hours, where: x.type === 'practical' ? 'WORKSHOP' : o.where }));
      })
      .catch(() => {});
  }, [params]);

  // Opened for an extra class or a cover (?change=CC001): fill the form from that class
  useEffect(() => {
    const id = params.get('change');
    if (!id) return;
    const day = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10); // today in Bhutan
    api(`/class-changes?from=${day}&to=${day}`)
      .then((list) => {
        const c = (Array.isArray(list) ? list : []).find((x) => x.id === id);
        if (!c || c.type === 'cancelled') return;
        const hours = Math.max(1, Math.round(((+c.end.slice(0, 2) * 60 + +c.end.slice(3)) - (+c.start.slice(0, 2) * 60 + +c.start.slice(3))) / 60));
        setChg(c);
        setF((o) => ({ ...o, module: c.module.id, room: c.room?.name || '', type: c.sessionType === 'practical' ? 'practical' : 'theory', hours, where: c.sessionType === 'practical' ? 'WORKSHOP' : o.where }));
      })
      .catch(() => {});
  }, [params]);
  // Countdowns: check-in time, then review time
  useEffect(() => {
    if (!ends) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [ends]);
  // worked out from the clock on every render, so they are never stale
  const left = ends ? Math.max(0, Math.round((ends - Date.now()) / 1000)) : 0; // check-in seconds left
  const reviewLeft = ends ? Math.max(0, Math.round(((closes || ends + REVIEW_MIN * 60000) - Date.now()) / 1000)) : 0;
  const ended = live?.status === 'ended';
  const open = sid && left > 0 && !ended; // students can check in
  const reviewing = sid && ends && !open && reviewLeft > 0 && !ended; // code closed, tutor decides flagged
  const closed = sid && ends && !open && !reviewing; // session over

  const loadLive = () => sid && api(`/sessions/${sid}/live`)
    .then((l) => { setLive(l); setLiveAt(Date.now()); if (l?.closesAt) setCloses(new Date(l.closesAt).getTime()); })
    .catch(() => {});

  // Live counts: poll while students check in and during the review time
  useEffect(() => {
    if (!sid) return;
    loadLive();
    if (!open && !reviewing) return;
    const t = setInterval(loadLive, 4000);
    return () => clearInterval(t);
  }, [sid, open, reviewing]);

  // Close the session (undecided flagged students become Absent) when the review time is over,
  // or straight away when the code has closed and nobody is waiting to be decided.
  const nobodyFlagged = live && liveAt >= ends && (live.flagged || []).length === 0;
  useEffect(() => {
    if (!sid || !ends || open || endedFor.current === sid || ended) return;
    if (!(closed || (reviewing && nobodyFlagged))) return;
    endedFor.current = sid;
    api(`/sessions/${sid}/end`, {}).catch(() => {}).finally(loadLive);
  }, [closed, reviewing, nobodyFlagged, sid, open, ended]);

  // When the code closes with flagged students waiting, open their list
  useEffect(() => {
    if (reviewing && (live?.flagged || []).length) setShowFlags(true);
  }, [reviewing, live]);

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
  // Practicals usually happen in a workshop, so switching the type suggests the matching location
  const setType = (e) => {
    const type = e.target.value;
    setF({ ...f, type, where: type === 'practical' ? 'WORKSHOP' : f.where === 'WORKSHOP' ? '' : f.where });
  };
  const workshop = f.where === 'WORKSHOP';
  const roomBuilding = buildingOfRoom(f.room, buildings);
  useEffect(() => {
    if (roomBuilding && f.where !== 'WORKSHOP' && f.where !== roomBuilding.key) setF((x) => ({ ...x, where: roomBuilding.key }));
    // rooms that aren't inside a mapped building → Workshop around the tutor:
    // labs (EG Lab, Robotic Lab, Hydraulics lab …) and LH-01 (lecture hall near the football ground)
    else if (!roomBuilding && !f.where && /\blab\b|workshop|^\s*lh[\s-]*0?1\b/i.test(f.room)) setF((x) => ({ ...x, where: 'WORKSHOP' }));
  }, [f.room, buildings]);

  const start = (pos) => {
    const { where, radius, ...rest } = f;
    return api('/sessions', {
      ...rest,
      ...(slot && f.module === slot.module.id && { slot: slot.id }),
      ...(chg && f.module === chg.module.id && { change: chg.id }),
      ...(workshop
        ? { mode: 'workshop', radius: Number(radius), lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }
        : { mode: 'building', building: where }),
      minutes: WINDOW_MIN,
    })
      .then((s) => {
        setLive(null);
        setShowFlags(false);
        setSid(s._id || s.id);
        const end = s.expiresAt ? new Date(s.expiresAt).getTime() : Date.now() + WINDOW_MIN * 60000;
        setEnds(end);
        setCloses(s.closesAt ? new Date(s.closesAt).getTime() : end + REVIEW_MIN * 60000);
        endedFor.current = null;
        setMsg('');
      })
      .catch((x) => { setMsg(x.message); setNotNow(x.code === 'CLASS_NOT_NOW'); })
      .finally(() => setBusy(false));
  };

  const gen = () => {
    if (!f.module) return setMsg('Please select a module.');
    if (!f.where) return setMsg('Choose where the class is.');
    if (workshop && !(Number(f.radius) >= 5 && Number(f.radius) <= 500)) return setMsg('Workshop radius must be 5–500 metres.');
    setNotNow(false);
    setBusy(true);

    // A building's outline is already known: no need for the tutor's GPS
    if (!workshop) return start(null);

    if (!navigator.geolocation) { setBusy(false); return setMsg('Location is not supported on this browser.'); }
    setMsg('Getting your location…');
    bestPosition().then((p) => start({ coords: { latitude: p.lat, longitude: p.lng, accuracy: p.accuracy } }),
      (e) => {
        setBusy(false);
        setMsg(
          e.code === 1
            ? 'Allow location access to start a workshop session.'
            : 'Could not get your location. Please try again.'
        );
      });
  };

  const reset = () => {
    setSid(null);
    setLive(null);
    setEnds(null);
    setCloses(null);
    setMsg('');
    setShowFlags(false);
  };

  const noMods = loaded && mods.length === 0 && !chg;
  const flagged = live?.flagged || [];

  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      {/* Session details */}
      <div className="panel" style={{ flex: 1, marginTop: 0 }}>
        <h3>Session details</h3>
        {slot && (
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#0f6cbf' }}>
            From your timetable: {slot.day} {slot.start}–{slot.end}{slot.group ? ` · Group ${slot.group}` : ''}
          </p>
        )}
        {chg && (
          <p style={{ margin: '0 0 8px', fontSize: 12, color: chg.counts ? '#2b6328' : '#495057' }}>
            {chg.type === 'cover'
              ? `Covering for ${chg.by?.name || 'another tutor'}: ${chg.start}–${chg.end}`
              : `${chg.counts ? 'Extra class' : 'Optional class (doesn’t count toward attendance)'}: ${chg.start}–${chg.end}`}
          </p>
        )}

        <div className="sa-grid">
          <div className="sa-f">
            <label htmlFor="sa-date">Date</label>
            <input id="sa-date" value={todayText()} readOnly disabled />
          </div>

          <div className="sa-f">
            <label htmlFor="sa-module">Module</label>
            <select id="sa-module" value={f.module} onChange={set('module')} disabled={open || noMods}>
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
                  {/* a module you are only covering today */}
                  {chg && !mods.some((m) => m.id === chg.module.id) && (
                    <option value={chg.module.id}>{chg.module.code} – {chg.module.name} (cover)</option>
                  )}
                </>
              )}
            </select>
          </div>

          <div className="sa-f">
            <label htmlFor="sa-room">Room</label>
            <input id="sa-room" value={f.room} onChange={set('room')} disabled={open} list="cst-rooms" placeholder="e.g. ITL 06" />
            <datalist id="cst-rooms">
              {buildings.flatMap((b) =>
                (b.rooms || []).map((r) => (
                  <option key={r.name} value={r.name}>{r.label ? `${r.label} · ${b.name}` : b.name}</option>
                ))
              )}
            </datalist>
            {roomBuilding && !workshop && (
              <small className="sa-ok">{f.room} is in the {roomBuilding.name}, so it’s selected below.</small>
            )}
          </div>

          <div className="sa-f">
            <label htmlFor="sa-type">Practical / theory</label>
            <select id="sa-type" value={f.type} onChange={setType} disabled={open}>
              <option value="theory">Theory</option>
              <option value="practical">Practical</option>
            </select>
          </div>

          <div className="sa-f">
            <label htmlFor="sa-where">Where students must be</label>
            <select id="sa-where" value={f.where} onChange={set('where')} disabled={open}>
              <option value="">Select location</option>
              {buildings.map((b) => (
                <option key={b.key} value={b.key}>{b.name}</option>
              ))}
              <option value="WORKSHOP">Workshop – around my location</option>
            </select>
          </div>

          <div className="sa-f">
            <label htmlFor="sa-hours">Total hours</label>
            <input id="sa-hours" type="number" min="1" value={f.hours} onChange={set('hours')} disabled={open} />
          </div>

          {workshop && (
            <div className="sa-f sa-wide">
              <label htmlFor="sa-radius">Workshop radius (metres)</label>
              <input id="sa-radius" type="number" min="5" max="500" value={f.radius} onChange={set('radius')} disabled={open} />
              <small className="sa-help">
                Stand in the middle of the workshop when you generate the code. Students must be within this distance of you.
              </small>
            </div>
          )}
        </div>

        <p>
          <small>
            Students have {WINDOW_MIN} minutes to check in. After that you have {REVIEW_MIN} more minutes to mark
            flagged students Present or Absent; anyone not decided is marked absent.
          </small>
        </p>
        {msg && <p className="err">{msg}</p>}
        {notNow && (
          <button
            type="button"
            onClick={() => nav(`/timetable?extra=1&module=${encodeURIComponent(f.module)}`)}
            style={{ background: 'none', border: 0, padding: 0, margin: '0 0 10px', color: '#0f6cbf', fontWeight: 700, cursor: 'pointer', font: 'inherit', fontSize: 13 }}
          >
            Book an extra class →
          </button>
        )}

        {closed ? (
          <button className="btn" style={{ width: '100%' }} onClick={reset}>
            Start new session
          </button>
        ) : (
          <button
            className="btn"
            style={{ width: '100%' }}
            onClick={gen}
            disabled={busy || open || reviewing || noMods}
          >
            {busy ? 'Starting…' : open ? 'Session running…' : reviewing ? 'Reviewing flagged students…' : 'Generate Check-in Code'}
          </button>
        )}
      </div>

      {/* Live code panel */}
      {sid && (
        <div className="panel" style={{ flex: 1, marginTop: 0, textAlign: 'center' }}>
          <small style={{ display: 'block', color: '#6a737b', marginBottom: 4 }}>{todayText()}</small>

          {open ? (
            <>
              <h2 style={{ fontSize: 40, letterSpacing: 6, margin: '8px 0' }}>{live?.code || '……'}</h2>
              <p style={{ fontSize: 22, fontWeight: 700, color: left <= 30 ? '#ca3120' : '#0f6cbf', margin: 0 }}>
                {mmss(left)}
              </p>
              <small>Students enter this code in the CheckIn app before the timer runs out.</small>
              {live?.location && (
                <small style={{ display: 'block', marginTop: 4, color: '#0f6cbf', fontWeight: 600 }}>
                  {live.location.mode === 'building'
                    ? `📍 Inside the ${live.location.name}`
                    : `📍 Workshop · within ${Math.round(live.location.radius)} m of you`}
                </small>
              )}
            </>
          ) : reviewing ? (
            <>
              <h3 style={{ margin: '8px 0' }}>Check-in closed</h3>
              <p style={{ fontSize: 22, fontWeight: 700, color: reviewLeft <= 30 ? '#ca3120' : '#f0ad4e', margin: 0 }}>
                {mmss(reviewLeft)}
              </p>
              <small>Time left to mark the flagged students below. Anyone not decided is marked absent.</small>
            </>
          ) : (
            <>
              <h3 style={{ margin: '8px 0' }}>Session closed</h3>
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
                  background: showFlags ? '#fcefdc' : 'none',
                  border: flagged.length ? '1px solid #f0ad4e' : '1px solid transparent',
                  borderRadius: 10,
                  padding: '4px 14px',
                  cursor: flagged.length ? 'pointer' : 'default',
                  font: 'inherit',
                }}
              >
                <b style={{ fontSize: 22, color: '#f0ad4e' }}>{flagged.length}</b>
                <br />
                <small>Flagged {flagged.length > 0 && (showFlags ? '▲' : '▼')}</small>
              </button>
            </div>
          )}

          {/* Flagged students: teacher decides Present or Absent */}
          {showFlags && flagged.length > 0 && (
            <div style={{ marginTop: 16, textAlign: 'left', borderTop: '1px solid #eee', paddingTop: 12 }}>
              <small style={{ color: '#6a737b' }}>
                {open || reviewing
                  ? 'Ask the student, then mark them. Anyone not decided before the review time ends becomes absent.'
                  : 'The session has closed.'}
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
                      borderBottom: '1px solid #f8f9fa',
                    }}
                  >
                    <div>
                      <b style={{ fontSize: 14 }}>{s.name}</b>
                      <br />
                      <small style={{ color: '#8a5a00' }}>⚑ {s.reason || 'Weak GPS accuracy'}</small>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => decide(s, true)}
                        disabled={!(open || reviewing) || deciding === aid}
                        style={{ padding: '6px 14px', background: '#357a32', color: '#fff', border: 0, borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Present
                      </button>
                      <button
                        onClick={() => decide(s, false)}
                        disabled={!(open || reviewing) || deciding === aid}
                        style={{ padding: '6px 14px', background: '#fff', color: '#ca3120', border: '1px solid #ca3120', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}
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