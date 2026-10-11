import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { PROGRAMMES } from './programmes';
import './adminoverview.css';

const E = encodeURIComponent;

export default function AdminOverview() {
  const nav = useNavigate();
  const [o, setO] = useState({});

  useEffect(() => {
    api('/admin/overview').then(setO).catch(() => {});
  }, []);

  const stats = [
    { label: 'Total Students', value: o.students, note: `↑ ${o.newStudents || 0} this month`, icon: '🎓', tone: 'blue' },
    { label: 'Total Tutors', value: o.tutors, note: 'Active faculty', icon: '👩‍🏫', tone: 'green' },
    { label: 'Total Programs', value: o.programs, note: 'Bachelor & Master', icon: '📘', tone: 'orange' },
  ];

  const views = [
    { title: 'Students view', text: 'See every student in a programme, their attendance, and activate or deactivate accounts.', base: 'students', icon: '🎓' },
    { title: 'Tutors view', text: 'See every tutor in a programme with their staff ID, and activate or deactivate accounts.', base: 'teachers', icon: '👩‍🏫' },
  ];

  return (
    <div className="ao">
      <h2 className="ao-title">
        Admin <small>Overview</small>
      </h2>

      {/* Totals: one line, three big cards */}
      <div className="ao-stats">
        {stats.map((s) => (
          <div className={'ao-stat ' + s.tone} key={s.label}>
            <div className="ao-icon">{s.icon}</div>
            <small>{s.label}</small>
            <b>{(s.value || 0).toLocaleString()}</b>
            <span>{s.note}</span>
          </div>
        ))}
      </div>

      {/* Students view + Tutors view: one line */}
      <div className="ao-views">
        {views.map((v) => (
          <div className="ao-view" key={v.base}>
            <div className="ao-vhead">
              <span className="ao-vicon">{v.icon}</span>
              <h3>{v.title}</h3>
            </div>
            <p>{v.text}</p>
            <select
              defaultValue=""
              onChange={(e) => e.target.value && nav(`/${v.base}/${E(e.target.value)}`)}
            >
              <option value="">Select programme</option>
              {PROGRAMMES.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}