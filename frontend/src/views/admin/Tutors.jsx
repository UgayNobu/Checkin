// Admin → Tutors
// Tutors no longer sign up and wait for approval. The admin:
//   1. creates the tutor account (staff ID, name, email, department, default password)
//      → the tutor is emailed their login details (and texted, if SMS is set up)
//   2. assigns the tutor's modules for this semester
//   3. can reset a forgotten password back to the default, or deactivate the account
// The tutor logs in with the default password and is asked to change it.
// Backend: GET/POST /admin/tutors, GET/POST /admin/tutors/:id/modules, POST /admin/tutors/:id/reset-password
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { DEPT, PROG } from '../shared/collegeLists';
import { StatusPill, StatusButton } from './AccountStatus';
import '../shared/classchanges.css';
import './tutors.css';

const EMPTY = { userId: '', name: '', email: '', phone: '', department: '', programme: '', password: '' };

export default function Tutors() {
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [assignFor, setAssignFor] = useState(null); // tutor whose modules are being assigned
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = () => api('/admin/tutors').then((r) => setList(Array.isArray(r) ? r : [])).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const shown = (list || []).filter((t) => `${t.name} ${t.userId} ${t.email} ${t.department || ''}`.toLowerCase().includes(q.toLowerCase()));
  const noModules = (list || []).filter((t) => t.active && t.modules.length === 0).length;

  const resetPw = (t) => {
    if (!window.confirm(`Reset ${t.name}'s password to the default password? They will be emailed and asked to change it.`)) return;
    setErr(''); setMsg('');
    api(`/admin/tutors/${encodeURIComponent(t.userId)}/reset-password`, {})
      .then((r) => { setMsg(`Password for ${t.name} reset to the default password (${r.defaultPassword}).`); load(); })
      .catch((x) => setErr(x.message));
  };

  return (
    <div className="tut">
      <div className="tut-head">
        <div>
          <h2 className="tut-title">Tutors</h2>
          <p className="tut-sub">Create tutor accounts and assign their modules. Tutors don't sign up or wait for approval.</p>
        </div>
        <button className="btn" onClick={() => { setAdding(true); setMsg(''); setErr(''); }}>Add tutor</button>
      </div>

      {/* Summary cards */}
      <div className="stats">
        <div className="stat"><b>{list ? list.length : '—'}</b><small>Tutor accounts</small></div>
        <div className="stat"><b>{list ? list.filter((t) => t.active).length : '—'}</b><small>Active</small></div>
        <div className="stat"><b>{list ? noModules : '—'}</b><small>Active tutors with no modules yet</small></div>
        <div className="stat"><b>{list ? list.filter((t) => t.mustChangePassword).length : '—'}</b><small>Still on the default password</small></div>
      </div>

      {msg && <p className="tut-ok" role="status">{msg}</p>}
      {err && <p className="err">{err}</p>}

      <div className="tut-bar">
        <input className="tut-search" placeholder="Search by name, staff ID, email or department" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="tbl">
        <table>
          <thead>
            <tr><th>Tutor</th><th>Staff ID</th><th>Department</th><th>Modules this semester</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {list === null ? (
              <tr><td colSpan={6} className="tut-empty">Loading tutors…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={6} className="tut-empty">{q ? 'No tutor matches that search.' : 'No tutors yet. Use "Add tutor" to create the first account.'}</td></tr>
            ) : (
              shown.map((t) => (
                <tr key={t.userId}>
                  <td>
                    <b>{t.name}</b>
                    <small className="tut-mail">{t.email}</small>
                  </td>
                  <td>{t.userId}</td>
                  <td>{t.department || <span className="tut-mut">Not set</span>}</td>
                  <td>
                    {t.modules.length ? (
                      <span className="tut-mods">{t.modules.map((m) => <span className="tut-mod" key={m.id}>{m.code}</span>)}</span>
                    ) : (
                      <span className="tut-pill warn">No modules yet</span>
                    )}
                  </td>
                  <td>
                    <span className="tut-cell">
                      <StatusPill user={t} />
                      {t.mustChangePassword && <span className="tut-pill warn">Default password</span>}
                    </span>
                  </td>
                  <td>
                    <span className="tut-actions">
                      <button className="tut-btn" onClick={() => setAssignFor(t)} disabled={!t.active}>Assign modules</button>
                      <button className="tut-btn" onClick={() => resetPw(t)}>Reset password</button>
                      <StatusButton user={t} role="teacher" onDone={load} />
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {adding && (
        <AddTutor
          onClose={() => setAdding(false)}
          onCreated={(t) => {
            setAdding(false);
            setMsg(`${t.name} (${t.userId}) was created with the default password ${t.defaultPassword}. Their login details were emailed to ${t.email}. Now assign their modules.`);
            load().then(() => setAssignFor(t));
          }}
        />
      )}
      {assignFor && <AssignModules tutor={assignFor} onClose={() => setAssignFor(null)} onSaved={(text) => { setAssignFor(null); setMsg(text); load(); }} />}
    </div>
  );
}

/* ---------- Add tutor (dialog) ---------- */
function AddTutor({ onClose, onCreated }) {
  const [f, setF] = useState(EMPTY);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setErr(''); };

  const save = (e) => {
    e.preventDefault();
    if (!/^CST-[A-Z0-9]{2,6}$/i.test(f.userId.trim())) return setErr('Staff ID looks like CST-0142.');
    if (f.name.trim().length < 2) return setErr('Enter the tutor\'s full name.');
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return setErr('Enter a valid email. Login details are sent there.');
    if (!f.department) return setErr('Choose the tutor\'s department.');
    setBusy(true);
    api('/admin/tutors', { ...f, userId: f.userId.trim().toUpperCase(), name: f.name.trim(), email: f.email.trim() })
      .then(onCreated)
      .catch((x) => setErr(x.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="cc-shade" role="dialog" aria-modal="true" aria-label="Add tutor">
      <form className="cc-box" onSubmit={save} noValidate>
        <h3>Add tutor</h3>
        <span className="cc-sub">The tutor can log in straight away. No approval step.</span>

        <div className="cc-two">
          <div>
            <label htmlFor="t-id">Staff ID</label>
            <input id="t-id" value={f.userId} onChange={set('userId')} placeholder="CST-0142" />
          </div>
          <div>
            <label htmlFor="t-phone">Phone (for SMS, optional)</label>
            <input id="t-phone" value={f.phone} onChange={set('phone')} placeholder="17xxxxxx" />
          </div>
        </div>
        <label htmlFor="t-name">Full name</label>
        <input id="t-name" value={f.name} onChange={set('name')} placeholder="e.g. Karma Wangmo" />
        <label htmlFor="t-mail">Email</label>
        <input id="t-mail" type="email" value={f.email} onChange={set('email')} placeholder="name.cst@rub.edu.bt" />
        <small className="cc-hint">The staff ID and default password are emailed here.</small>

        <div className="cc-two">
          <div>
            <label htmlFor="t-dept">Department</label>
            <select id="t-dept" value={f.department} onChange={set('department')}>
              <option value="">Select</option>
              {DEPT.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="t-prog">Programme (optional)</label>
            <select id="t-prog" value={f.programme} onChange={set('programme')}>
              <option value="">Select</option>
              {PROG.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <label htmlFor="t-pw">Default password</label>
        <input id="t-pw" value={f.password} onChange={set('password')} placeholder="Leave empty to use the college default" />
        <small className="cc-hint">The tutor is asked to change it after their first login.</small>

        {err && <p className="cc-err">{err}</p>}
        <div className="cc-row">
          <button type="button" className="cc-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="cc-btn blue" disabled={busy}>{busy ? 'Creating…' : 'Create tutor'}</button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Assign modules (dialog) ---------- */
function AssignModules({ tutor, onClose, onSaved }) {
  const [mods, setMods] = useState(null);
  const [pick, setPick] = useState([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/admin/modules').then((l) => setMods(Array.isArray(l) ? l : [])).catch(() => setMods([]));
  }, []);

  const has = (m) => m.tutor?.userId === tutor.userId;
  const shown = useMemo(
    () => (mods || []).filter((m) => `${m.code} ${m.name}`.toLowerCase().includes(q.toLowerCase())),
    [mods, q],
  );
  const toggle = (id) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const save = () => {
    if (!pick.length) return setErr('Tick at least one module.');
    const moving = (mods || []).filter((m) => pick.includes(m._id) && m.tutor && !has(m));
    if (moving.length && !window.confirm(`${moving.map((m) => `${m.code} (now ${m.tutor.name})`).join(', ')} will move to ${tutor.name}. Continue?`)) return;
    setBusy(true);
    api(`/admin/tutors/${encodeURIComponent(tutor.userId)}/modules`, { moduleIds: pick })
      .then((r) => onSaved(`${tutor.name} now teaches ${r.modules.map((m) => m.code).join(', ')}. They were notified by email.`))
      .catch((x) => setErr(x.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="cc-shade" role="dialog" aria-modal="true" aria-label={`Assign modules to ${tutor.name}`}>
      <div className="cc-box tut-assign">
        <h3>Assign modules</h3>
        <span className="cc-sub">{tutor.name} · {tutor.userId}{tutor.department ? ` · ${tutor.department}` : ''}</span>

        <input className="tut-search" placeholder="Search modules by code or name" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="tut-list">
          {mods === null ? (
            <p className="tut-mut">Loading modules…</p>
          ) : shown.length === 0 ? (
            <p className="tut-mut">No modules found. Add modules under Program / Module first.</p>
          ) : (
            shown.map((m) => (
              <label key={m._id} className={'tut-opt' + (has(m) ? ' mine' : pick.includes(m._id) ? ' on' : '')}>
                <input type="checkbox" checked={has(m) || pick.includes(m._id)} disabled={has(m)} onChange={() => toggle(m._id)} />
                <span className="tut-opt-main">
                  <b>{m.code} – {m.name}</b>
                  <small>
                    {m.year ? `Year ${m.year}` : ''}{m.semester ? ` · Sem ${m.semester}` : ''}{m.students != null ? ` · ${m.students} students` : ''}
                  </small>
                </span>
                {has(m) ? <span className="tut-pill ok">Assigned</span>
                  : m.tutor ? <span className="tut-pill warn">{m.tutor.name}</span>
                    : <span className="tut-pill free">No tutor</span>}
              </label>
            ))
          )}
        </div>
        <small className="cc-hint">To take a module away from a tutor, assign it to another tutor. Past semesters keep their tutor.</small>

        {err && <p className="cc-err">{err}</p>}
        <div className="cc-row">
          <button type="button" className="cc-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="cc-btn blue" onClick={save} disabled={busy || !pick.length}>{busy ? 'Saving…' : `Assign ${pick.length || ''} module${pick.length === 1 ? '' : 's'}`}</button>
        </div>
      </div>
    </div>
  );
}
