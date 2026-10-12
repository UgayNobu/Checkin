import { useEffect, useState } from 'react';
import { api } from '../../api';
import '../teacher/staff.css';
import '../student/attendance.css';
import './Teacher.css';

export function TeacherList() {
  const [d, setD] = useState(null);
  
  useEffect(() => { api('/management/teachers').then(setD); }, []);
  
  if (!d) return null;
  
  return (
    <div className="mg">
      <h2 className="ttl">Teacher</h2>
      <div className="stat" style={{ marginBottom: 24 }}>
        <small>Total Teacher</small><b>{d.total}</b>
      </div>
      <h4 style={{ fontSize: 11 }}>All</h4>
      <div className="tbl" style={{ maxWidth: 560 }}>
        <table>
          <thead>
            <tr><th>Module</th><th>Name</th><th>class</th><th>total class take</th></tr>
          </thead>
          <tbody>
            {d.rows.map((r, i) => (
              <tr key={i}>
                <td>{r.module}</td>
                <td>{r.name}</td>
                <td className="mut">{r.cls}</td>
                <td><span className="pill ok">{r.hours}hr</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}