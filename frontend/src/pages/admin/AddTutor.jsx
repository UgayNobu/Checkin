// Admin home: create a tutor account directly. The tutor can log in straight away with
// the default password and change it in Settings → Account. Tutors who are not in the
// system can still sign up themselves; they appear under Tutor requests.
import { useState } from 'react';
import { api } from '../../api';
import './addtutor.css';

const DEPT = [
  'Architecture',
  'Civil & Environmental Engineering',
  'Computing Technologies',
  'Electrical & Electronics Engineering',
  'Mechanical Engineering',
  'Science & Humanities',
  'Dean of Academic Affairs',
  'Dean of Student Affairs',
];
const EMPTY = { userId: '', name: '', email: '', department: '' };

export default function AddTutor({ onClose, onCreated }) {
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState({});
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setErr({ ...err, [k]: '' }); setMsg(''); };

  const check = () => {
    const e = {};
    if (!/^CST-[A-Z0-9]{2,6}$/i.test(f.userId.trim())) e.userId = 'Staff ID like CST-0142';
    if (f.name.trim().length < 2) e.name = 'Enter the full name';
    if (!/@rub\.edu\.bt$/i.test(f.email.trim())) e.email = 'College email ending in @rub.edu.bt';
    if (!f.department) e.department = 'Choose a department';
    setErr(e);
    return !Object.keys(e).length;
  };

  const save = (e) => {
    e.preventDefault();
    if (!check()) return;
    setBusy(true);
    api('/admin/tutors', { ...f, userId: f.userId.trim().toUpperCase(), name: f.name.trim(), email: f.email.trim() })
      .then((u) => { setDone(u); setF(EMPTY); onCreated?.(u); })
      .catch((x) => setMsg(x.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="at">
      <div className="at-head">
        <h3>Add a tutor</h3>
        <button type="button" className="at-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      <p className="at-sub">
        The account works straight away with the default password. The tutor can change it in Settings → Account.
      </p>

      {done && (
        <div className="at-ok" role="status">
          <b>{done.name} ({done.userId}) can log in now.</b>
          <span>Default password: <code>{done.defaultPassword}</code></span>
          <small>{done.emailed ? `The login details were also emailed to ${done.email}.` : 'Email is not set up on the server, so tell the tutor their login details.'}</small>
        </div>
      )}

      <form className="at-grid" onSubmit={save} noValidate>
        <label>
          Staff ID
          <input value={f.userId} onChange={set('userId')} placeholder="CST-0142" autoComplete="off" />
          {err.userId && <small className="err">{err.userId}</small>}
        </label>
        <label>
          Full name
          <input value={f.name} onChange={set('name')} placeholder="e.g. Karma Dorji" autoComplete="off" />
          {err.name && <small className="err">{err.name}</small>}
        </label>
        <label>
          College email
          <input type="email" value={f.email} onChange={set('email')} placeholder="name@rub.edu.bt" autoComplete="off" />
          {err.email && <small className="err">{err.email}</small>}
        </label>
        <label>
          Department
          <select value={f.department} onChange={set('department')}>
            <option value="">Select department</option>
            {DEPT.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          {err.department && <small className="err">{err.department}</small>}
        </label>
        {msg && <p className="err at-msg">{msg}</p>}
        <div className="at-acts">
          <button type="button" className="at-cancel" onClick={onClose}>Close</button>
          <button className="at-save" disabled={busy}>{busy ? 'Creating…' : 'Create tutor account'}</button>
        </div>
      </form>
    </div>
  );
}
