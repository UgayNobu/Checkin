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

export default function Evidence() {
  const nav = useNavigate();
  const pick = useRef();

  const [type, setType] = useState(null);       // which leave form is open
  const [module, setModule] = useState('');     // which module the absence was for
  const [mods, setMods] = useState([]);         // the student's enrolled modules
  const [formMsg, setFormMsg] = useState('');   // errors shown inside the pop-up
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState(null);
  const [list, setList] = useState([]);
  const [sum, setSum] = useState({ rate: 0, absences: 0 });
  const [msg, setMsg] = useState('');

  const load = () => {
    api('/evidence/mine').then(setList);
    api('/student/summary').then(setSum);
  };
  useEffect(load, []);
  useEffect(() => { api('/student/dashboard').then(setMods).catch(() => {}); }, []); // enrolled modules for the dropdown

  const closeForm = () => { setType(null); setModule(''); setDate(''); setReason(''); setFile(null); setFormMsg(''); };

  const submit = () => {
    if (!module) return setFormMsg('Please choose the module you missed.');
    if (!date) return setFormMsg('Please choose the date you missed.');
    if (file && file.size > 10 * 1024 * 1024) return setFormMsg('The file is too big (max 10 MB).');
    const fd = new FormData();
    fd.append('module', module);
    fd.append('type', type);
    fd.append('date', date);
    fd.append('reason', reason);
    if (file) fd.append('file', file);
    setBusy(true);
    api('/evidence', fd)
      .then(() => { setMsg('Request submitted. Management will review it.'); closeForm(); load(); })
      .catch((e) => setFormMsg(e.message)) // keep the form open and show why
      .finally(() => setBusy(false));
  };

  return (
    <div className="ev">
      {/* 1. Leave buttons - same line */}
      <div className="ev-types">
        {TYPES.map((t) => (
          <button key={t.key} className={'ev-type' + (type === t.key ? ' on' : '')} onClick={() => { setMsg(''); setType(t.key); }}>
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
              <small>{r.module?.code ? `${r.module.code} · ` : ''}Missed {fmt(r.date)}</small>
              {r.reason && <small className="ev-reason">{r.reason}</small>}
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

            <label>Module</label>
            <select value={module} onChange={(e) => { setModule(e.target.value); setFormMsg(''); }}>
              <option value="">Select the module you missed</option>
              {mods.map((m) => <option key={m.id} value={m.id}>{m.code} – {m.name}</option>)}
            </select>
            {mods.length === 0 && <small>You are not enrolled in any module yet. Enrol first in Settings.</small>}

            <label>Date missed</label>
            <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => { setDate(e.target.value); setFormMsg(''); }} />

            <label>Reason for Absence</label>
            <textarea rows="4" value={reason} onChange={(e) => setReason(e.target.value)} />

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