import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import './staff.css';
const short = (d) => new Date(d).toLocaleDateString('en', { month: 'short', day: 'numeric' });
const cell = (v) => v ? <span className={'pill ' + (v === 'present' ? 'b' : 'red')}>{v === 'present' ? 'Present' : 'Absent'}</span> : <span className="mut">–</span>;

export function RecordStudents() {
  const { id } = useParams(), nav = useNavigate(), [r, setR] = useState([]); useEffect(() => { api('/teacher/records/' + id).then(setR); }, [id]);
  const dl = () => {
    const csv = 'Student ID,Name,Practical,Theory,Total\n' + r.map((x) => [x.userId, x.name, x.practical, x.theory, x.total].join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv])); a.download = 'attendance.csv'; a.click();
  };
  return (<div className="staff"><div className="rowb"><button className="back" onClick={() => nav('/records')}>&lt;back</button><button className="dl" onClick={dl}>Download</button></div>
    <div className="tbl"><table><thead><tr><th>Student ID</th><th>Name</th><th>Practical</th><th>Theory</th><th>Total %</th><th /></tr></thead>
      <tbody>{r.map((x) => <tr key={x.id}><td>{x.userId}</td><td>{x.name}</td><td className="mut">{x.practical}%</td>
        <td><span className={'pill ' + (x.theory >= 90 ? 'b' : 'o')}>{x.theory}%</span></td><td className="blue-t">{x.total}%</td>
        <td><a className="view" onClick={() => nav(`/records/${id}/${x.id}`)}>view</a></td></tr>)}</tbody></table></div></div>);
}

export function RecordStudent() {
  const { id, sid } = useParams(), nav = useNavigate(), [d, setD] = useState(null); useEffect(() => { api(`/teacher/records/${id}/${sid}`).then(setD); }, [id, sid]);
  if (!d) return null;
  return (<div className="staff"><button className="back" onClick={() => nav('/records/' + id)}>&lt;back</button>
    <p className="who"><span><b>{d.student.name}</b><br />{d.student.userId}</span></p>
    <div className="tbl"><table><thead><tr><th>Date</th><th>practical</th><th>theory</th></tr></thead>
      <tbody>{d.rows.map((x) => <tr key={x.date}><td>{short(x.date)}</td><td>{cell(x.practical)}</td><td>{cell(x.theory)}</td></tr>)}</tbody></table></div></div>);
}
