// Tutor dialogs for one-day timetable changes (backend: classChange.service.js):
//   CancelDialog  – a timetable class is not held on that date (nobody is marked absent)
//   CoverDialog   – another tutor takes a timetable class on that date
//   ExtraDialog   – book a class that isn't on the timetable (make-up, extra, optional)
import { span12 } from '../../time12';
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

const what = (x) => `${x.module.code} · ${nice(x.date)}, ${span12(x.start, x.end)}${x.room ? ` · ${x.room.name}` : ''}`;

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
        <li>To exchange class times with another tutor, use "Swap with another tutor" instead.</li>
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

  // "Start now": a class can be booked for right now (rounded down to 5 minutes), for one hour
  const isToday = f.date === today;
  const startNow = () => {
    const now = new Date(Date.now() + 6 * 3600 * 1000); // Bhutan time
    const m = now.getUTCHours() * 60 + Math.floor(now.getUTCMinutes() / 5) * 5;
    const hm = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
    set('start', hm(m)); set('end', hm(Math.min(m + 60, 23 * 60 + 59)));
  };

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
          <label>Times on {info.day} <small className="cc-key"><i className="f" />free <i className="b" />busy <i className="p" />over</small></label>
          <div className="cc-periods">
            {info.periods.map((p) => (
              <button
                key={p.start} type="button"
                className={'cc-period' + (p.past ? ' past' : p.free ? ' free' : ' busy') + (f.start === p.start && f.end === p.end ? ' on' : '')}
                title={p.free ? 'Free' : p.why}
                disabled={p.past}
                onClick={() => { set('start', p.start); set('end', p.end); }}
              >
                {span12(p.start, p.end)}
                <small>{p.free ? 'Free' : p.past ? 'Over' : 'Busy'}</small>
              </button>
            ))}
          </div>
        </>
      )}

      {isToday && (
        <button type="button" className="cc-now" onClick={startNow}>Start now (for 1 hour)</button>
      )}
      <small className="cc-hint">Pick a time above, or type any start and end time.</small>
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
          <label htmlFor="cc-room">{f.sessionType === 'practical' ? 'Room (optional)' : 'Room'}</label>
          <select id="cc-room" value={f.room} onChange={(e) => set('room', e.target.value)}>
            <option value="">{f.sessionType === 'practical' ? 'No room – anywhere (practical)' : 'No room / somewhere else'}</option>
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


/**
 * Ask another tutor to swap: your class and one of theirs exchange time and room
 * (each keeps its own module and students). Nothing changes until they accept.
 */
export function SwapDialog({ item, onClose, onDone }) {
  const [tutors, setTutors] = useState(null);
  const [tutor, setTutor] = useState('');
  const [date, setDate] = useState(item.date);
  const [options, setOptions] = useState(null); // their classes that day
  const [pick, setPick] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/class-changes/tutors').then(setTutors).catch((e) => { setErr(e.message); setTutors([]); });
  }, []);
  useEffect(() => {
    setPick(''); setOptions(null);
    if (!tutor || !date) return undefined;
    let stale = false;
    api(`/class-changes/swaps/options?tutor=${encodeURIComponent(tutor)}&date=${date}`)
      .then((r) => !stale && setOptions(Array.isArray(r) ? r : []))
      .catch((e) => { if (!stale) { setOptions([]); setErr(e.message); } });
    return () => { stale = true; };
  }, [tutor, date]);
  const keyOf = (o) => o.changeId || o.slotId;
  const theirs = (options || []).find((o) => keyOf(o) === pick);
  const save = () => {
    if (!tutor) return setErr('Choose a tutor.');
    if (!theirs) return setErr('Choose which of their classes to swap with.');
    setBusy(true);
    const mine = item.kind === 'extra' ? { change: item.change.id } : { slot: item.id, date: item.date };
    const other = theirs.kind === 'extra' ? { withChange: theirs.changeId } : { withSlot: theirs.slotId, withDate: theirs.date };
    api('/class-changes/swaps', { ...mine, withTutor: tutor, ...other, note: note.trim() })
      .then(onDone).catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };
  const name = (tutors || []).find((t) => t.id === tutor)?.name || 'They';
  return (
    <Shell title="Swap with another tutor" sub={`Your class: ${what(item)}`} onClose={onClose} busy={busy}>
      <ul className="cc-info">
        <li>Your class and theirs exchange <b>date, time and room</b>. You still teach your module, they teach theirs. Timetable classes and booked extra classes can both be swapped.</li>
        <li>Nothing changes until they <b>accept</b>. They get a notification; you get one when they answer.</li>
        <li>Once accepted, both groups of students are told when and where to come.</li>
      </ul>
      <label htmlFor="sw-tutor">Tutor</label>
      <select id="sw-tutor" value={tutor} onChange={(e) => { setTutor(e.target.value); setErr(''); }} disabled={!tutors}>
        <option value="">{tutors ? 'Choose a tutor' : 'Loading tutors…'}</option>
        {(tutors || []).map((t) => <option key={t.id} value={t.id}>{t.name || t.id}{t.department ? ` · ${t.department}` : ''}</option>)}
      </select>
      <label htmlFor="sw-date">Their class on</label>
      <input id="sw-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setErr(''); }} />
      {tutor && (
        <>
          <label>Their class</label>
          {!options ? (
            <small className="cc-hint">Loading their classes…</small>
          ) : !options.length ? (
            <small className="cc-hint">{name} has no class that can be swapped on this day. Try another date.</small>
          ) : (
            <div className="cc-periods">
              {options.map((o) => (
                <button key={keyOf(o)} type="button" className={'cc-period free' + (pick === keyOf(o) ? ' on' : '')} onClick={() => { setPick(keyOf(o)); setErr(''); }}>
                  {span12(o.start, o.end)}
                  <small>{o.module.code}{o.kind === 'extra' ? ' · extra' : ''}{o.room ? ` · ${o.room.name}` : ''}</small>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {theirs && (
        <div className="cc-swap">
          <b>After the swap</b>
          <span>{item.module.code}: {nice(theirs.date)}, {span12(theirs.start, theirs.end)}{theirs.room ? ` · ${theirs.room.name}` : ''}</span>
          <span>{theirs.module.code}: {nice(item.date)}, {span12(item.start, item.end)}{item.room ? ` · ${item.room.name}` : ''}</span>
        </div>
      )}
      <label htmlFor="sw-note">Message to them (optional)</label>
      <input id="sw-note" value={note} maxLength={150} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I have a meeting at 9" />
      {err && <p className="cc-err">{err}</p>}
      <div className="cc-row">
        <button className="cc-btn ghost" onClick={onClose} disabled={busy}>Close</button>
        <button className="cc-btn blue" onClick={save} disabled={busy || !theirs}>{busy ? 'Sending…' : 'Send swap request'}</button>
      </div>
    </Shell>
  );
}

/** Swap requests on the tutor's Timetable: accept / reject the ones sent to you, cancel your own. */
export function SwapRequests({ reload, onChanged }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const load = () => api('/class-changes/swaps').then(setData).catch(() => setData({ incoming: [], outgoing: [] }));
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [reload]);
  if (!data) return null;
  const pendingIn = data.incoming.filter((s) => s.status === 'pending');
  const pendingOut = data.outgoing.filter((s) => s.status === 'pending');
  const recent = [...data.incoming, ...data.outgoing].filter((s) => s.status !== 'pending').slice(0, 3);
  if (!pendingIn.length && !pendingOut.length && !recent.length) return null;
  const act = (s, how) => {
    setBusy(s.id); setErr('');
    api(`/class-changes/swaps/${s.id}/${how}`, {})
      .then(() => { load(); onChanged?.(how); })
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(null));
  };
  const cls = (c) => `${c.module.code} · ${nice(c.date)}, ${span12(c.start, c.end)}${c.room ? ` · ${c.room.name}` : ''}`;
  const words = { accepted: 'Accepted', rejected: 'Rejected', cancelled: 'Cancelled', expired: 'Expired' };
  return (
    <div className="sw-box">
      <b className="sw-title">Swap requests</b>
      {pendingIn.map((s) => (
        <div key={s.id} className="sw-row in">
          <div>
            <b>{s.from.name}</b> wants to swap their <b>{cls(s.from.class)}</b> with your <b>{cls(s.to.class)}</b>.
            {s.note && <small>“{s.note}”</small>}
          </div>
          <div className="sw-btns">
            <button className="cc-btn blue" disabled={busy === s.id} onClick={() => act(s, 'accept')}>Accept</button>
            <button className="cc-btn ghost" disabled={busy === s.id} onClick={() => act(s, 'reject')}>Reject</button>
          </div>
        </div>
      ))}
      {pendingOut.map((s) => (
        <div key={s.id} className="sw-row out">
          <div>Waiting for <b>{s.to.name}</b>: your {cls(s.from.class)} ↔ their {cls(s.to.class)}.</div>
          <div className="sw-btns">
            <button className="cc-btn ghost" disabled={busy === s.id} onClick={() => act(s, 'cancel')}>Cancel request</button>
          </div>
        </div>
      ))}
      {recent.map((s) => (
        <div key={s.id} className="sw-row done">
          <span className={'sw-tag ' + s.status}>{words[s.status] || s.status}</span>
          <span>{s.from.name}’s {s.from.class.module.code} ↔ {s.to.name}’s {s.to.class.module.code} ({nice(s.from.class.date)})</span>
        </div>
      ))}
      {err && <p className="cc-err">{err}</p>}
    </div>
  );
}
