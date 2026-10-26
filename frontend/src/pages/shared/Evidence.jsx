import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, auth, fileHref } from '../../api';
import './evidence.css';
const fd = (d) => new Date(d).toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' });
const ini = (n = '') => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export default function Evidence() {
  const nav = useNavigate(), act = auth.get().user.role === 'management', [l, setL] = useState([]);
  const load = () => api('/evidence').then(setL); useEffect(() => { load(); }, []);
  const set = (id, status) => api('/evidence/' + id, { status }, 'PATCH').then(load);
  return (
    <div className="evd">
      {l.filter((r) => r.status === 'pending').map((r) => (
        <div className="rcard" key={r._id}>
          <div className="rtop"><span className="av">{ini(r.student?.name)}</span>
            <div><b>{r.student?.name}</b> <span className="mut">· {r.student?.userId}</span><br /><small>{r.module?.name || 'Module'} · Missed {fd(r.date)}</small></div><span className="st">Pending</span></div>
          <p className="q">"{r.reason}"</p>
          {r.fileUrl ? <a className="file" href={fileHref(r.fileUrl)} target="_blank" rel="noreferrer">📄 {r.fileName || 'Open document'}</a> : <small>⊘ No document attached</small>}
          {act && <div className="acts2"><button className="rej" onClick={() => set(r._id, 'rejected')}>Reject</button><button className="app" onClick={() => set(r._id, 'approved')}>Approve</button></div>}
        </div>))}
      <h4>All requests</h4>
      <div className="tbl"><table><thead><tr><th>Date</th><th>Student ID</th><th>Name</th><th>class</th>{act && <th>Status</th>}<th>{act ? 'Action' : 'Medical report'}</th></tr></thead>
        <tbody>{l.map((r) => <tr key={r._id}><td>{new Date(r.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</td><td>{r.student?.userId}</td><td>{r.student?.name}</td><td className="mut">{r.module?.name}</td>
          {act && <td><span className={'pill ' + (r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'red' : 'o')}>{r.status}</span></td>}
          <td><a className="view" onClick={() => nav('/evidence/' + r._id)}>View</a></td></tr>)}</tbody></table></div>
    </div>);
}

const fl = (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const ft = (d) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const STATUS = { pending: ['Pending review', 'o'], approved: ['Approved', 'ok'], rejected: ['Rejected', 'red'] };

export function Certificate() {
  const { id } = useParams(), nav = useNavigate(), [r, setR] = useState(null);
  useEffect(() => { api(auth.get().user.role === 'student' ? '/evidence/mine' : '/evidence').then((l) => setR(l.find((x) => x._id === id))); }, [id]);
  if (!r) return null;
  const url = fileHref(r.fileUrl);
  const [label, tone] = STATUS[r.status] || [r.status, 'o'];
  const rows = [
    ['Module', r.module?.name || 'All enrolled modules'],
    ['Date missed', fl(r.date)],
    r.createdAt && ['Submitted', ft(r.createdAt)],
    r.reviewedAt && [r.status === 'rejected' ? 'Rejected' : 'Reviewed', `${ft(r.reviewedAt)}${r.reviewer?.name ? ` by ${r.reviewer.name}` : ''}`],
  ].filter(Boolean);
  return (
    <div className="evd evx">
      <button className="evx-back" onClick={() => nav('/evidence')}>← Back to absence requests</button>
      <div className="evx-grid">
        <section className="evx-card">
          <div className="evx-who">
            <span className="av">{ini(r.student?.name)}</span>
            <div><b>{r.student?.name}</b><small>{r.student?.userId}</small></div>
            <span className={'evx-st ' + tone}>{label}</span>
          </div>
          <dl className="evx-dl">
            {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <div className="evx-reason">
            <h4>Reason given</h4>
            <p>{r.reason || <span className="mut">No reason written</span>}</p>
          </div>
        </section>
        <section className="evx-card evx-doc">
          <div className="evx-doc-head">
            <h4>Supporting document</h4>
            {url && <a className="evx-open" href={url} target="_blank" rel="noreferrer">Open in new tab ↗</a>}
          </div>
          {url ? (
            <>
              <div className="evx-frame">
                {r.fileType === 'image' ? <img src={url} alt={r.fileName || 'Supporting document'} /> : <iframe src={url} title="Supporting document" />}
              </div>
              <small className="evx-fname">{r.fileName || 'document'}</small>
            </>
          ) : <div className="evx-frame evx-nofile">No document attached</div>}
        </section>
      </div>
    </div>
  );
}
