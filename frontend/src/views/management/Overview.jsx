import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import '../teacher/staff.css';
import '../student/attendance.css';
import './Overview.css';

const Stat = ({ l, v, chip, cls }) => (
  <div className="stat">
    <small>{l}</small>
    <b>{v ?? ''}</b>
    {chip && <div><span className={'chip ' + (cls || 'g')}>{chip}</span></div>}
  </div>
);

const initialDepts = [
  { department: 'Software Engineering' },
  { department: 'Electronics & Comm' },
  { department: 'Architecture' },
  { department: 'Civil Engineering' },
  { department: 'Electrical Engineering' },
  { department: 'Information Technology' }
];

export function Overview() {
  const nav = useNavigate();
  const [stats, setStats] = useState({});
  const [depts, setDepts] = useState(initialDepts);


  useEffect(() => {
    // 1. Fetch the overview totals + department table
    api('/management/overview')
      .then((d) => {
        setStats(d.totals || {});
        if (d.departments && d.departments.length > 0) {
          setDepts(d.departments);
        }
      })
      .catch((err) => console.error('Overview API error:', err));

    // The backend also counts the students below the required % (management can't use admin-only lists)
  }, []);

  return (
    <div className="mg">
      <h2 className="ttl">Overall View</h2>

      <div className="stats">
        <Stat
          l="Total Students"
          v={stats.students}
          chip={stats.newStudents ? `↑ ${stats.newStudents} this month` : null}
        />
        <Stat
          l="Total Tutors"
          v={stats.tutors}
          chip={stats.tutors ? 'Active faculty' : null}
        />
        <Stat l="Total Modules" v={stats.modules} />
        <Stat
          l={`Below ${stats.requiredPct ?? 90}%`}
          v={stats.belowRequired}
          chip={stats.belowRequired > 0 ? 'Needs review' : null}
          cls="o"
        />
      </div>

      <h4>Department-wise Attendance</h4>
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>DEPARTMENT</th>
              <th>STUDENTS</th>
              <th>MODULES</th>
              <th>ATTENDANCE</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {depts.map((r, i) => (
              <tr key={i}>
                <td><b>{r.department}</b></td>
                <td>{r.students ?? ''}</td>
                <td>{r.modules ?? ''}</td>
                <td>{r.attendance != null ? `${r.attendance}%` : <span style={{ color: 'var(--muted)' }}>No classes yet</span>}</td>
                <td>
                  <a
                    className="view"
                    style={{ color: 'var(--blue)', cursor: 'pointer' }}
                    onClick={() => nav('/department/' + encodeURIComponent(r.department))}
                  >
                    view
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}