import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import './Overview.css';

const Stat = ({ l, v, chip, cls }) => (
  <div className="stat">
    <small>{l}</small>
    <b>{v ?? '-'}</b>
    {chip && <div><span className={'chip ' + (cls || 'g')}>{chip}</span></div>}
  </div>
);

const initialDepts = [
  { department: 'Software Engineering', students: null, modules: null, attendance: null },
  { department: 'Electronics & Comm', students: null, modules: null, attendance: null },
  { department: 'Architecture', students: null, modules: null, attendance: null },
  { department: 'Civil Engineering', students: null, modules: null, attendance: null },
  { department: 'Electrical Engineering', students: null, modules: null, attendance: null },
  { department: 'Information Technology', students: null, modules: null, attendance: null }
];

export function Overview() {
  const nav = useNavigate();
  const [stats, setStats] = useState({}); 
  const [depts, setDepts] = useState(initialDepts); 

  useEffect(() => {
    api('/management/overview')
      .then((d) => {
        setStats(d.totals);
        if (d.departments && d.departments.length > 0) {
          setDepts(d.departments);
        }
      })
      .catch((err) => console.error("API Error:", err));
  }, []);

  return (
    <div className="mg">
      <h2 className="ttl">Overall View</h2>
      
      <div className="stats">
        <Stat l="Total Students" v={stats.students} chip={stats.newStudents != null ? `↑ ${stats.newStudents} this month` : null} cls="g" />
        <Stat l="Total Tutors" v={stats.tutors} chip="Active faculty" cls="g" />
        <Stat l="Total Modules" v={stats.modules} />
        <Stat l="Below 80%" v={stats.below80} chip="Needs review" cls="o" />
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
            {depts.map((dept, i) => (
              <tr key={i}>
                <td><b>{dept.department}</b></td>
                <td>{dept.students ?? '-'}</td>
                <td>{dept.modules ?? '-'}</td>
                <td>{dept.attendance != null ? `${dept.attendance}%` : '-'}</td>
                <td>
                  <a 
                    className="view" 
                    onClick={() => nav('/department/' + encodeURIComponent(dept.department))}
                    style={{ cursor: 'pointer' }}
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