// Activate / deactivate accounts (admin). Accounts are never deleted:
// a deactivated student or tutor can't log in, is left out of new classes,
// keeps all their records, and can be activated again later.
import { useState } from 'react';
import { api } from '../../api';
import './accountstatus.css';

export const REASONS = {
  student: [
    ['graduated', 'Graduated'],
    ['dropped_out', 'Dropped out'],
    ['transferred', 'Transferred to another college'],
    ['on_leave', 'On leave / taking a break'],
    ['other', 'Other'],
  ],
  staff: [
    ['resigned', 'Resigned'],
    ['retired', 'Retired'],
    ['transferred', 'Transferred'],
    ['on_leave', 'On leave'],
    ['other', 'Other'],
  ],
};
const LABEL = Object.fromEntries([...REASONS.student, ...REASONS.staff]);

const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** Status pill: Active / Waiting for approval / Inactive (with the reason and date). */
export function StatusPill({ user }) {
  if (user.active) return <span className="as-pill on">Active</span>;
  if (user.pending) return <span className="as-pill wait">Waiting for approval</span>;
  const d = user.deactivation;
  return (
    <span className="as-cell">
      <span className="as-pill off">Inactive</span>
      {d && (
        <small title={d.note || ''}>
          {LABEL[d.reason] || d.reason}
          {d.at ? ` · ${day(d.at)}` : ''}
        </small>
      )}
    </span>
  );
}

/**
 * The Activate / Deactivate button plus its confirmation panel.
 * role: 'student' | 'teacher'. onDone(updatedUser) runs after a change.
 */
export function StatusButton({ user, role, onDone }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // modules a departing tutor still holds

  const reasons = role === 'student' ? REASONS.student : REASONS.staff;
  const who = role === 'student' ? 'student' : 'tutor';

  const send = (body) => {
    setBusy(true);
    setErr('');
    return api('/admin/users/' + user._id, body, 'PATCH')
      .then((u) => {
        if (u.modulesToReassign?.length) setDone(u.modulesToReassign);
        else setOpen(false);
        onDone?.(u);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  };

  const confirm = () => {
    if (!reason) return setErr('Choose a reason.');
    if (reason === 'other' && !note.trim()) return setErr('Write a short note for "Other".');
    send({ active: false, reason, note: note.trim() || undefined });
  };

  if (user.active === false) {
    return (
      <span className="as-actions">
        <button className="as-btn on" onClick={() => send({ active: true })} disabled={busy}>
          {busy ? 'Saving…' : user.pending ? 'Approve' : 'Activate'}
        </button>
        {err && <small className="as-err">{err}</small>}
      </span>
    );
  }

  return (
    <>
      <button className="as-btn off" onClick={() => { setOpen(true); setReason(''); setNote(''); setErr(''); setDone(null); }}>
        Deactivate
      </button>

      {open && (
        <div className="as-shade" onClick={() => !busy && setOpen(false)}>
          <div className="as-box" role="dialog" aria-modal="true" aria-labelledby={'as-t-' + user._id} onClick={(e) => e.stopPropagation()}>
            {done ? (
              <>
                <h3 id={'as-t-' + user._id}>{user.name} is deactivated</h3>
                <p>They still teach these modules this semester. Assign a new tutor to each one in Program / Module:</p>
                <ul className="as-mods">
                  {done.map((m) => <li key={m.id}><b>{m.code}</b> {m.name}</li>)}
                </ul>
                <div className="as-row">
                  <button className="as-btn dark" onClick={() => setOpen(false)}>OK</button>
                </div>
              </>
            ) : (
              <>
                <h3 id={'as-t-' + user._id}>Deactivate {user.name}?</h3>
                <small className="as-id">{who} · {user.userId}</small>
                <ul className="as-info">
                  <li>They can't log in, and anyone logged in as them is signed out.</li>
                  <li>
                    {role === 'student'
                      ? "They won't be marked absent in new classes or counted in class sizes."
                      : 'Their modules this semester will need a new tutor.'}
                  </li>
                  <li>Nothing is deleted. You can activate them again at any time.</li>
                </ul>

                <label htmlFor={'as-r-' + user._id}>Reason</label>
                <select id={'as-r-' + user._id} value={reason} onChange={(e) => { setReason(e.target.value); setErr(''); }}>
                  <option value="">Choose a reason</option>
                  {reasons.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>

                <label htmlFor={'as-n-' + user._id}>Note {reason === 'other' ? '' : '(optional)'}</label>
                <textarea
                  id={'as-n-' + user._id}
                  rows={2}
                  maxLength={200}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={role === 'student' ? 'e.g. Graduated in July 2026' : 'e.g. Last working day 30 Sep'}
                />

                {err && <p className="as-err">{err}</p>}
                <div className="as-row">
                  <button className="as-btn ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
                  <button className="as-btn off solid" onClick={confirm} disabled={busy}>{busy ? 'Saving…' : 'Deactivate'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
