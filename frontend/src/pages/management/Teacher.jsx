import { useEffect, useState } from 'react';
import { api } from '../../api';
import '../teacher/staff.css';
import '../student/attendance.css';
import './Teacher.css';

// One steady colour per person (same name → same colour)
const AV = ['#0f6cbf', '#12867a', '#e07b16', '#7b4fbf', '#c2410c', '#2563a8'];
const avatarColor = (n) => AV[[...n].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0) % AV.length];

export function TeacherList() {
  const [d, setD] = useState(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/management/teachers')
      .then((data) => {
        setD(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error loading teachers:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="mg">
        <h2 className="ttl">Teacher</h2>
        <p style={{ color: '#6a737b', fontSize: 13 }}>Loading teachers...</p>
      </div>
    );
  }

  if (!d) {
    return (
      <div className="mg">
        <h2 className="ttl">Teacher</h2>
        <p style={{ color: '#ca3120', fontSize: 13 }}>Failed to load teacher data.</p>
      </div>
    );
  }

  // Group rows by teacher name so we can show one avatar per teacher
  const rows = (d.rows || []).filter((r) => {
    const s = (r.name + ' ' + r.module).toLowerCase();
    return s.includes(q.toLowerCase());
  });

  const initials = (name) =>
    name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="mg">
      {/* Header */}
      <div className="tch-header">
        <div>
          <h2 className="ttl">Teachers</h2>
          <p className="tch-sub">All faculty members and the modules they teach</p>
        </div>
        <div className="tch-stat">
          <small>Total Teachers</small>
          <b>{d.total}</b>
        </div>
      </div>

      {/* Search bar */}
      <div className="tch-toolbar">
        <input
          className="tch-search"
          placeholder="🔍  Search by teacher name or module..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="tch-count">
          {rows.length} {rows.length === 1 ? 'row' : 'rows'}
        </span>
      </div>

      {/* Table */}
      <div className="tch-tbl">
        <table>
          <thead>
            <tr>
              <th style={{ width: '40%' }}>MODULE</th>
              <th style={{ width: '30%' }}>TEACHER</th>
              <th style={{ width: '15%' }}>STUDENTS</th>
              <th style={{ width: '15%' }}>HOURS TAUGHT</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan="4" className="tch-empty">
                  No teachers match your search.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i}>
                  <td className="tch-module">{r.module}</td>
                  <td>
                    <div className="tch-person">
                      <div className="tch-avatar" style={{ background: avatarColor(r.name || '') }}>{initials(r.name || '?')}</div>
                      <div>
                        <b>{r.name}</b>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="tch-badge">{r.students}</span>
                  </td>
                  <td>
                    <span className={'tch-hours ' + (r.hours > 0 ? 'has' : '')}>
                      {r.hours} hr
                    </span>
                    <small className="tch-muted"> · {r.classes} class{r.classes === 1 ? '' : 'es'}</small>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}