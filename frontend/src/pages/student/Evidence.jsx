import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import './evidence.css';

const TYPES = [
  { key: 'official', label: 'Official Leave', icon: '📋' },
  { key: 'medical', label: 'Medical Leave', icon: '🩺' },
];
const STATUS = { approved: 'Approved', pending: 'Pending', rejected: 'Rejected' };
const fmt = (d) => new Date(d).toLocaleDateString('en', { month: 'short', day: '2-digit', year: 'numeric' });

// Today's date as YYYY-MM-DD in the student's own time zone
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function Evidence() {
  const nav = useNavigate();
  const pick = useRef();

  const [type, setType] = useState(null);       // which leave form is open
  const [formMsg, setFormMsg] = useState('');   // errors shown inside the pop-up
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(today());    // starts as today
  const [reason, setReason] = useState('');
  const [file, setFile] = useState(null);
  const [list, setList] = useState([]);
  const [sum, setSum] = useState({ rate: 0, absences: 0 });
  const [msg, setMsg] = useState('');
  const [updates, setUpdates] = useState([]);   // unread decision messages from management

  const load = () => {
    api('/evidence/mine').then(setList).catch(() => setList([]));
    api('/student/summary').then(setSum).catch(() => {});
    api('/notifications')
      .then((l) => setUpdates((Array.isArray(l) ? l : []).filter((n) => n.category === 'Evidence Documents' && !n.isRead)))
      .catch(() => setUpdates([]));
  };
  useEffect(load, []);

  const dismiss = (id) => api(`/notifications/${id}/read`, {}, 'PUT').then(load).catch(() => {});

  const openForm = (key) => { setMsg(''); setDate(today()); setType(key); };
  const closeForm = () => { setType(null); setDate(today()); setReason(''); setFile(null); setFormMsg(''); };

  const submit = () => {
    if (!date) return setFormMsg('Please choose the date.');
    if (!reason.trim()) return setFormMsg('Please write the reason for your absence.');
    if (file && file.size > 10 * 1024 * 1024) return setFormMsg('The file is too big (max 10 MB).');

    const fd = new FormData();
    fd.append('type', type);
    fd.append('date', date);
    fd.append('reason', reason);
    if (file) fd.append('file', file);

    setBusy(true);
    api('/evidence', fd)
      .then(() => { setMsg('Request submitted. Your tutors can see it and management will review it.'); closeForm(); load(); })
      .catch((e) => setFormMsg(e.message)) // keep the form open and show why
      .finally(() => setBusy(false));
  };

  return (
    <div className="ev">
      {/* 0. Decision messages from management */}
      {updates.length > 0 && (
        <div className="ev-updates">
          <h4>🔔 Updates</h4>
          {updates.map((n) => (
            <div className={'ev-update ' + (/approved/i.test(n.message) ? 'approved' : /rejected/i.test(n.message) ? 'rejected' : '')} key={n.id}>
              <span>{n.message}</span>
              <button onClick={() => dismiss(n.id)}>Got it</button>
            </div>
          ))}
        </div>
      )}

      {/* 1. Leave buttons - same line */}
      <div className="ev-types">
        {TYPES.map((t) => (
          <button key={t.key} className={'ev-type' + (type === t.key ? ' on' : '')} onClick={() => openForm(t.key)}>
            <span className="ev-ic">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* 2. Requirements + stats */}
      <div className="ev-info">
        <div className="ev-req">
          <h4>Attendance Requirements</h4>
          <p>Students must maintain a minimum of 90% attendance across all modules to qualify for final module assessments. Pending absence requests take up to 52 hours to process.</p>
        </div>
        <div className="ev-stats">
          <div className="ev-stat"><b>{sum.rate}%</b><small>Attendance Rate</small></div>
          <div className="ev-stat"><b>{sum.absences}</b><small>Absences</small></div>
        </div>
      </div>

      {msg && <p className="ev-msg">{msg}</p>}

      {/* 3. Evidence Document list */}
      <h3 className="ev-title">Evidence Document</h3>
      <div className="ev-list">
        {list.length === 0 && (
          <div className="ev-empty">No evidence documents yet. Choose Official Leave or Medical Leave to submit one.</div>
        )}
        {list.map((r) => (
          <div className="ev-item" key={r._id}>
            <span className="ev-ico">{r.type === 'official' ? '📋' : '🩺'}</span>
            <div className="ev-main">
              <b>{r.type === 'official' ? 'Official Leave' : 'Medical Leave'}</b>
              <small>{r.module?.code ? `${r.module.code} · ` : ''}{fmt(r.date)}</small>
              {r.reason && <small className="ev-reason">{r.reason}</small>}
              {r.status !== 'pending' && (
                <small className={'ev-decision ' + r.status}>
                  {STATUS[r.status] || r.status}
                  {r.reviewer?.name ? ` by ${r.reviewer.name}` : ''}
                  {r.reviewedAt ? ` · ${fmt(r.reviewedAt)}` : ''}
                </small>
              )}
            </div>
            <span className={'ev-badge ' + r.status}>{STATUS[r.status] || r.status}</span>
            <button className="ev-view" onClick={() => nav('/evidence/' + r._id)}>View</button>
          </div>
        ))}
      </div>

      {/* Leave form (pop-up) */}
      {type && (
        <div className="overlay" onClick={closeForm}>
          <div className="form" onClick={(e) => e.stopPropagation()}>
            <h3>{type === 'medical' ? 'Medical Leave' : 'Official Leave'}</h3>
            <small>Please fill in the date and reasons with valid supporting documents.</small>

            <label>Date</label>
            <input
              type="date"
              value={date}
              max={today()}
              onChange={(e) => { setDate(e.target.value); setFormMsg(''); }}
            />

            <label>Reason for Absence</label>
            <textarea rows="4" value={reason} onChange={(e) => { setReason(e.target.value); setFormMsg(''); }} />

            <label>Supporting Document</label>
            <div className="drop" onClick={() => pick.current.click()}>
              <span>⇪</span>
              <b>{file ? file.name : 'Upload supporting document'}</b>
              <small>PDF, JPG, PNG up to 10MB</small>
              <input ref={pick} type="file" hidden accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files[0])} />
            </div>

            {formMsg && <p className="ev-err">{formMsg}</p>}
            <button className="submit" onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit'}</button>
          </div>
        </div>
      )}
    </div>
  );
}