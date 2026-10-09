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
  const { id } = useParams(), [key, setKey] = useState(''), [st, setSt] = useState([]), [msg, setMsg] = useState('');
  const load = () => api(`/modules/${id}/students`).then(setSt);
  useEffect(() => { api('/teacher/modules').then((l) => setKey(l.find((y) => y.id === id)?.enrolmentKey || '')); load(); }, [id]);
  const add = () => { const u = prompt('Student ID'); if (u) api(`/modules/${id}/students`, { userId: u }).then(load).catch((e) => setMsg(e.message)); };
  return (
    <div className="staff keypg"><h2>Module enrolment_key</h2><input className="keybox" value={key} onChange={(e) => setKey(e.target.value)} />
      <button className="pbtn" onClick={() => api(`/modules/${id}/key`, { key }, 'PUT').then(() => setMsg('Saved'))}>save</button><span className="ok">{msg}</span>
      <div className="rowb"><b>Enrolment_student</b><button className="addb" onClick={add}>+ Add</button></div>
      <div className="tbl"><table><thead><tr><th>Student Number</th><th>Name</th><th>Date</th></tr></thead>
        <tbody>{st.map((x, i) => <tr key={i}><td>{x.student.userId}</td><td><b>{x.student.name}</b></td><td><span className="pill b">{dt(x.date)}</span></td></tr>)}</tbody></table></div></div>);
}
