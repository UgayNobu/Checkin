import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, auth, FILES } from '../../api';
import './evidence.css';
const fd = (d) => new Date(d).toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' });
const ini = (n = '') => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export default function Evidence() {
  const nav = useNavigate(), act = auth.get().user.role === 'management', [l, setL] = useState([]);
  const load = () => api('/relief').then(setL); useEffect(() => { load(); }, []);
  const set = (id, status) => api('/relief/' + id, { status }, 'PATCH').then(load);
  return (
    <div className="evd">
      {l.filter((r) => r.status === 'pending').map((r) => (
        <div className="rcard" key={r._id}>
          <div className="rtop"><span className="av">{ini(r.student?.name)}</span>
            <div><b>{r.student?.name}</b> <span className="mut">· {r.student?.userId}</span><br /><small>{r.module?.name || 'Module'} · Missed {fd(r.date)}</small></div><span className="st">Pending</span></div>
          <p className="q">"{r.reason}"</p>
          {r.fileUrl ? <a className="file" href={FILES + r.fileUrl} target="_blank" rel="noreferrer">📄 {r.fileUrl.split('/').pop()}</a> : <small>⊘ No document attached</small>}
          {act && <div className="acts2"><button className="rej" onClick={() => set(r._id, 'rejected')}>Reject</button><button className="app" onClick={() => set(r._id, 'approved')}>Approve</button></div>}
        </div>))}
      <h4>All requests</h4>
      <div className="tbl"><table><thead><tr><th>Date</th><th>Student ID</th><th>Name</th><th>class</th>{act && <th>Status</th>}<th>{act ? 'Action' : 'Medical report'}</th></tr></thead>
        <tbody>{l.map((r) => <tr key={r._id}><td>{new Date(r.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</td><td>{r.student?.userId}</td><td>{r.student?.name}</td><td className="mut">{r.module?.name}</td>
          {act && <td><span className={'pill ' + (r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'red' : 'o')}>{r.status}</span></td>}
          <td><a className="view" onClick={() => nav('/evidence/' + r._id)}>View</a></td></tr>)}</tbody></table></div>
    </div>);
}

export function Certificate() {
  const { id } = useParams(), nav = useNavigate(), [r, setR] = useState(null);
  useEffect(() => { api(auth.get().user.role === 'student' ? '/relief/mine' : '/relief').then((l) => setR(l.find((x) => x._id === id))); }, [id]);
  if (!r) return null; const url = r.fileUrl && FILES + r.fileUrl;
  return (<div className="evd"><button className="back" onClick={() => nav('/evidence')} style={{ background: 'none', border: 0, cursor: 'pointer', marginBottom: 10 }}>&lt;back</button>
    <div className="doc"><div className="meta"><div className="rtop"><span className="av">{ini(r.student?.name)}</span><div><b>{r.student?.name}</b> <span className="mut">· {r.student?.userId}</span><br />{r.module?.name} · Missed {fd(r.date)}</div></div>
      <p className="q">"{r.reason}"</p></div>
      {url ? (/\.pdf$/i.test(url) ? <iframe src={url} title="document" /> : <img src={url} alt="document" />) : <small>⊘ No document attached</small>}</div></div>);
}
