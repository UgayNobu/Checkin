import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import './staff.css';
const dt = (d) => new Date(d).toLocaleDateString('en', { day: 'numeric', month: 'numeric', year: 'numeric' });

export function Modules({ to = '/modules', label = 'Enrolment_key' }) {
  const nav = useNavigate(), [m, setM] = useState([]); useEffect(() => { api('/teacher/modules').then(setM); }, []);
  return (<div className="staff"><div className="mcards">{m.map((x) => (
    <div className="mcard" key={x.id}><span className="mic" /><small>{x.code}</small><b>{x.name}</b><small>Section {x.section} · {x.students} students</small>
      <button className="pbtn" onClick={() => nav(`${to}/${x.id}`)}>{label}</button></div>))}</div></div>);
}
export const RecordModules = () => <Modules to="/records" label="Details" />;

export function ModuleKey() {
  const { id } = useParams(), [key, setKey] = useState(''), [open, setOpen] = useState(true), [st, setSt] = useState([]), [msg, setMsg] = useState('');
  const load = () => api(`/modules/${id}/students`).then(setSt);
  useEffect(() => { api('/teacher/modules').then((l) => { const m = l.find((y) => y.id === id); setKey(m?.enrolmentKey || ''); setOpen(m?.selfEnrol !== false); }); load(); }, [id]);
  const toggle = () => api(`/modules/${id}/key`, { selfEnrol: !open }, 'PUT').then((m) => { setOpen(m.selfEnrol); setMsg(m.selfEnrol ? 'Self-enrolment opened' : 'Self-enrolment closed'); }).catch((e) => setMsg(e.message));
  const remove = (x) => { if (window.confirm(`Remove ${x.student.name} (${x.student.userId}) from this module?`)) api(`/modules/${id}/students/${x.student.userId}`, null, 'DELETE').then(load).catch((e) => setMsg(e.message)); };
  const add = () => { const u = prompt('Student ID'); if (u) api(`/modules/${id}/students`, { userId: u }).then(load).catch((e) => setMsg(e.message)); };
  return (
    <div className="staff keypg"><h2>Module enrolment_key</h2><input className="keybox" value={key} onChange={(e) => setKey(e.target.value)} />
      <button className="pbtn" onClick={() => api(`/modules/${id}/key`, { key }, 'PUT').then(() => setMsg('Saved')).catch((e) => setMsg(e.message))}>save</button>
      <label className="ok" style={{ marginLeft: 12 }}><input type="checkbox" checked={open} onChange={toggle} /> Allow students to self-enrol with the key</label><span className="ok">{msg}</span>
      <div className="rowb"><b>Enrolment_student</b><button className="addb" onClick={add}>+ Add</button></div>
      <div className="tbl"><table><thead><tr><th>Student Number</th><th>Name</th><th>Date</th><th></th></tr></thead>
        <tbody>{st.map((x, i) => <tr key={i}><td>{x.student.userId}</td><td><b>{x.student.name}</b></td><td><span className="pill b">{dt(x.date)}</span></td><td><button className="addb" onClick={() => remove(x)}>Remove</button></td></tr>)}</tbody></table></div></div>);
}
