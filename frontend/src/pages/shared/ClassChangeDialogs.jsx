// Tutor dialogs for one-day timetable changes (backend: classChange.service.js):
//   CancelDialog  – a timetable class is not held on that date (nobody is marked absent)
//   CoverDialog   – another tutor takes a timetable class on that date
//   ExtraDialog   – book a class that isn't on the timetable (make-up, extra, optional)
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import './classchanges.css';

const nice = (d) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });

const REASONS = {
  cancel: [['on_leave', 'Tutor on leave'], ['college_event', 'College event'], ['exam', 'Exam'], ['holiday', 'Holiday'], ['other', 'Other']],
  cover: [['on_leave', 'Tutor on leave'], ['swap', 'Swapped with another tutor'], ['college_event', 'College event'], ['other', 'Other']],
  extra: [['make_up', 'Make-up class'], ['extra_lecture', 'Extra lecture'], ['revision', 'Revision class'], ['other', 'Other']],
};

function Shell({ title, sub, onClose, busy, children }) {
  const box = useRef(null);
  useEffect(() => {
    box.current?.querySelector('select, input, textarea, button')?.focus();
    const esc = (e) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="cc-shade" onClick={() => !busy && onClose()}>
      <div className="cc-box" role="dialog" aria-modal="true" aria-label={title} ref={box} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {sub && <small className="cc-sub">{sub}</small>}
        {children}
      </div>
    </div>
  );
}

function Reason({ kind, reason, setReason, note, setNote }) {
  return (
    <>
      <label htmlFor="cc-reason">Reason</label>
      <select id="cc-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
        <option value="">Choose a reason</option>
        {REASONS[kind].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <label htmlFor="cc-note">Note {reason === 'other' ? '' : '(optional)'}</label>
      <input id="cc-note" value={note} maxLength={150} onChange={(e) => setNote(e.target.value)} placeholder="Students see this" />
    </>
  );
}

const what = (x) => `${x.module.code} · ${nice(x.date)}, ${x.start}–${x.end}${x.room ? ` · ${x.room.name}` : ''}`;

/** Cancel one timetable class on one date. */
export function CancelDialog({ item, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = () => {
    if (!reason) return setErr('Choose a reason.');
    if (reason === 'other' && !note.trim()) return setErr('Write a short note for "Other".');
    setBusy(true);
    api('/class-changes', { type: 'cancelled', slot: item.id, date: item.date, reason, note: note.trim() })
      .then(onDone).catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };
  return (
    <Shell title="Cancel this class?" sub={what(item)} onClose={onClose} busy={busy}>
      <ul className="cc-info">
        <li>Only this date is cancelled. The class stays on the timetable for other weeks.</li>
        <li>Students are told, and nobody is marked absent.</li>
        <li>You can undo it before the class time.</li>
      </ul>
      <Reason kind="cancel" {...{ reason, setReason, note, setNote }} />
      {err && <p className="cc-err">{err}</p>}
      <div className="cc-row">
        <button className="cc-btn ghost" onClick={onClose} disabled={busy}>Keep the class</button>
        <button className="cc-btn red" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Cancel class'}</button>
      </div>
    </Shell>
  );
}

/** Ask another tutor to take one timetable class on one date. */
export function CoverDialog({ item, onClose, onDone }) {
  const [tutors, setTutors] = useState(null);
  const [tutor, setTutor] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/class-changes/tutors').then(setTutors).catch((e) => { setErr(e.message); setTutors([]); });
  }, []);
  const save = () => {
    if (!tutor) return setErr('Choose a tutor.');
    if (!reason) return setErr('Choose a reason.');
    if (reason === 'other' && !note.trim()) return setErr('Write a short note for "Other".');
    setBusy(true);
    api('/class-changes', { type: 'cover', slot: item.id, date: item.date, coverTutor: tutor, reason, note: note.trim() })
      .then(onDone).catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };
  return (
    <Shell title="Ask another tutor to take this class" sub={what(item)} onClose={onClose} busy={busy}>
      <ul className="cc-info">
        <li>They start attendance for it from their Timetable, and it counts as normal.</li>
        <li>To swap classes, each tutor does this for their own class.</li>
      </ul>
      <label htmlFor="cc-tutor">Tutor</label>
      <select id="cc-tutor" value={tutor} onChange={(e) => { setTutor(e.target.value); setErr(''); }} disabled={!tutors}>
        <option value="">{tutors ? 'Choose a tutor' : 'Loading tutors…'}</option>
        {(tutors || []).map((t) => <option key={t.id} value={t.id}>{t.name || t.id}{t.department ? ` · ${t.department}` : ''}</option>)}
      </select>
      <Reason kind="cover" {...{ reason, setReason, note, setNote }} />
      {err && <p className="cc-err">{err}</p>}
      <div className="cc-row">
        <button className="cc-btn ghost" onClick={onClose} disabled={busy}>Close</button>
        <button className="cc-btn blue" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Ask them to cover'}</button>
      </div>
    </Shell>
  );
}

/** Book a class that isn't on the timetable. Free periods, free rooms and clashes come from the server. */
export function ExtraDialog({ mods, date: firstDate, module: firstModule, today, onClose, onDone }) {
  const [f, setF] = useState({
    module: firstModule || (mods.length === 1 ? mods[0].id : ''), date: firstDate, start: '', end: '', room: '',
    sessionType: 'theory', counts: true, reason: '', note: '',
  });
  const [info, setInfo] = useState(null); // { periods, clashes, rooms }
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setErr(''); };

  // Ask the server what's free whenever the module, date, time, room or "counts" changes
  useEffect(() => {
    if (!f.module || !f.date) return setInfo(null);
    const q = new URLSearchParams({ module: f.module, date: f.date, counts: String(f.counts) });
    if (f.start && f.end && f.end > f.start) { q.set('start', f.start); q.set('end', f.end); }
    if (f.room) q.set('room', f.room);
    let stale = false;
    const t = setTimeout(() => {
      api('/class-changes/check?' + q).then((r) => !stale && setInfo(r)).catch((e) => !stale && setErr(e.message));
    }, 200);
    return () => { stale = true; clearTimeout(t); };
  }, [f.module, f.date, f.start, f.end, f.room, f.counts]);

  const blockers = (info?.clashes || []).filter((c) => c.blocks);
  const warnings = (info?.clashes || []).filter((c) => !c.blocks);
  const roomGone = f.room && info?.rooms && !info.rooms.some((r) => r.id === f.room) && !blockers.some((c) => c.kind === 'room');

  const save = () => {
    if (!f.module) return setErr('Choose a module.');
    if (!f.start || !f.end) return setErr('Choose a period, or type a start and end time.');
    if (f.end <= f.start) return setErr('The class must end after it starts.');
    if (!f.reason) return setErr('Choose a reason.');
    if (f.reason === 'other' && !f.note.trim()) return setErr('Write a short note for "Other".');
    setBusy(true);
    api('/class-changes', { type: 'extra', ...f, room: f.room || undefined, note: f.note.trim() })
      .then(onDone).catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };

  return (
    <Shell title="Book an extra class" sub="For a class that isn't on the timetable" onClose={onClose} busy={busy}>
      <label htmlFor="cc-mod">Module</label>
      <select id="cc-mod" value={f.module} onChange={(e) => set('module', e.target.value)}>
        <option value="">Choose a module</option>
        {mods.map((m) => <option key={m.id} value={m.id}>{m.code} – {m.name}</option>)}
      </select>

      <label htmlFor="cc-date">Date</label>
      <input id="cc-date" type="date" min={today} value={f.date} onChange={(e) => set('date', e.target.value)} />

      <fieldset className="cc-counts">
        <legend>Attendance</legend>
        <label className={f.counts ? 'on' : ''}>
          <input type="radio" name="cc-counts" checked={f.counts} onChange={() => set('counts', true)} />
          <span><b>Counts</b><small>Students who miss it are marked absent. Management can see it.</small></span>
        </label>
        <label className={!f.counts ? 'on' : ''}>
          <input type="radio" name="cc-counts" checked={!f.counts} onChange={() => set('counts', false)} />
          <span><b>Optional</b><small>For free or revision classes. Shows who came; never counts toward anyone's %.</small></span>
        </label>
      </fieldset>

      {f.module && info?.periods?.length > 0 && (
        <>
          <label>Periods on {info.day}</label>
          <div className="cc-periods">
            {info.periods.map((p) => (
              <button
                key={p.start} type="button"
                className={'cc-period' + (p.free ? '' : ' busy') + (f.start === p.start && f.end === p.end ? ' on' : '')}
                title={p.free ? 'Free' : p.why}
                disabled={p.past}
                onClick={() => { set('start', p.start); set('end', p.end); }}
              >
                {p.start}–{p.end}
                <small>{p.free ? 'Free' : p.past ? 'Over' : 'Busy'}</small>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="cc-two">
        <div>
          <label htmlFor="cc-start">Starts</label>
          <input id="cc-start" type="time" value={f.start} onChange={(e) => set('start', e.target.value)} />
        </div>
        <div>
          <label htmlFor="cc-end">Ends</label>
          <input id="cc-end" type="time" value={f.end} onChange={(e) => set('end', e.target.value)} />
        </div>
      </div>

      <div className="cc-two">
        <div>
          <label htmlFor="cc-room">Room</label>
          <select id="cc-room" value={f.room} onChange={(e) => set('room', e.target.value)}>
            <option value="">No room / somewhere else</option>
            {(info?.rooms || []).map((r) => <option key={r.id} value={r.id}>{r.name}{r.location ? ` · ${r.location}` : ''}</option>)}
          </select>
          {!info?.rooms && <small className="cc-hint">Choose a time to see free rooms.</small>}
        </div>
        <div>
          <label htmlFor="cc-type">Type</label>
          <select id="cc-type" value={f.sessionType} onChange={(e) => set('sessionType', e.target.value)}>
            <option value="theory">Theory</option>
            <option value="practical">Practical</option>
          </select>
        </div>
      </div>

      {blockers.length > 0 && (
        <div className="cc-clash">
          <b>Can't book this time</b>
          <ul>{blockers.map((c) => <li key={c.text}>{c.text}</li>)}</ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="cc-warn">
          <b>Some students have another class then</b>
          <ul>{warnings.map((c) => <li key={c.text}>{c.text}</li>)}</ul>
          <small>That's allowed for an optional class.</small>
        </div>
      )}
      {roomGone && <p className="cc-err">That room is not free at this time.</p>}
      {f.start && f.end && info?.clashes && !blockers.length && !warnings.length && <p className="cc-free">✓ Free for you, your students and the room.</p>}

      <Reason kind="extra" reason={f.reason} setReason={(v) => set('reason', v)} note={f.note} setNote={(v) => set('note', v)} />

      {err && <p className="cc-err">{err}</p>}
      <div className="cc-row">
        <button className="cc-btn ghost" onClick={onClose} disabled={busy}>Close</button>
        <button className="cc-btn blue" onClick={save} disabled={busy || blockers.length > 0}>
          {busy ? 'Booking…' : f.counts ? 'Book extra class' : 'Book optional class'}
        </button>
      </div>
    </Shell>
  );
}

/** Undo a change (confirm first). */
export function UndoDialog({ change, onClose, onDone }) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const label = { cancelled: 'Undo the cancellation?', cover: 'Take this class back?', extra: change.counts ? 'Call off this extra class?' : 'Call off this optional class?' }[change.type];
  const go = () => {
    setBusy(true);
    api('/class-changes/' + change.id, null, 'DELETE').then(onDone).catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };
  return (
    <Shell title={label} sub={what(change)} onClose={onClose} busy={busy}>
      <p className="cc-p">
        {change.type === 'cancelled' && 'The class goes back on, and students are told.'}
        {change.type === 'cover' && `${change.coverTutor?.name || 'The other tutor'} is told they no longer need to take it.`}
        {change.type === 'extra' && 'It is removed from the timetable, and students are told.'}
      </p>
      {err && <p className="cc-err">{err}</p>}
      <div className="cc-row">
        <button className="cc-btn ghost" onClick={onClose} disabled={busy}>Close</button>
        <button className="cc-btn blue" onClick={go} disabled={busy}>{busy ? 'Saving…' : 'Yes'}</button>
      </div>
    </Shell>
  );
}
