import { useEffect, useState } from 'react';
import { api } from '../../api';
import './staff.css';
export default function Dashboard() {
  const [m, setM] = useState([]), [me, setMe] = useState({});
  useEffect(() => { api('/teacher/modules').then(setM); api('/me').then(setMe); }, []);
  const total = m.reduce((a, x) => a + x.students, 0);
  return (
    <div className="staff"><h3>Welcome back, {me.name?.split(' ')[0]}</h3>
      <p className="date">{new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      <div className="two"><div className="big blue"><small>Total Module</small><b>{m.length}</b></div>
        <div className="big green"><small>Total Students</small><b>{total}</b><small>Across {m.length} modules</small></div></div>
      <h4>Each Module</h4>
      <div className="tbl"><table><thead><tr><th>Module</th><th>total student</th></tr></thead>
        <tbody>{m.map((x) => <tr key={x.id}><td>{x.code} – {x.name}</td><td className="blue-t">{x.students}</td></tr>)}</tbody></table></div></div>);
}
