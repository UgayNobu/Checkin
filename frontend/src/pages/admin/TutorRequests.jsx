// Admin: tutors who signed up and are waiting for approval.
// Approve → they can log in (and get a notification + email). Reject → the request is closed.
// Backend: GET /admin/tutors/pending, POST /admin/tutors/:id/approve | /reject
import { useEffect, useState } from 'react';
import { api } from '../../api';
import './tutorrequests.css';

const when = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

export default function TutorRequests() {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(null); // id being saved
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = () => api('/admin/tutors/pending').then((r) => setList(Array.isArray(r) ? r : [])).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const decide = (t, ok) => {
    if (!ok && !window.confirm(`Reject ${t.name} (${t.userId})? They will not be able to log in.`)) return;
    setBusy(t._id); setErr(''); setMsg('');
    api(`/admin/tutors/${encodeURIComponent(t._id)}/${ok ? 'approve' : 'reject'}`, {})
      .then(() => { setMsg(ok ? `${t.name} approved. They can log in now.` : `${t.name}'s request was rejected.`); load(); })
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(null));
  };

  // Nothing to show: keep the page clean
  if (!list || (!list.length && !msg && !err)) return null;

  return (
    <section className="tr">
      <div className="tr-head">
        <h3>Tutor requests</h3>
        {list.length > 0 && <span className="tr-count">{list.length} waiting</span>}
      </div>
      {msg && <p className="tr-ok" role="status">✓ {msg}</p>}
      {err && <p className="err">{err}</p>}
      {list.length === 0 ? (
        <p className="tr-empty">No tutors are waiting for approval.</p>
      ) : (
        <ul className="tr-list">
          {list.map((t) => (
            <li key={t._id}>
              <div className="tr-who">
                <b>{t.name}</b>
                <small>{[t.userId, t.department, t.email].filter(Boolean).join(' · ')}</small>
                {t.createdAt && <em>Requested {when(t.createdAt)}</em>}
              </div>
              <div className="tr-act">
                <button className="tr-yes" onClick={() => decide(t, true)} disabled={busy === t._id}>{busy === t._id ? 'Saving…' : 'Approve'}</button>
                <button className="tr-no" onClick={() => decide(t, false)} disabled={busy === t._id}>Reject</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
