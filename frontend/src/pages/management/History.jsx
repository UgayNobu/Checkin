import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import SemesterPicker, { useSemester } from '../shared/SemesterPicker';
import '../teacher/staff.css';
import '../student/attendance.css';
import './History.css';

const E = encodeURIComponent;

const Back = ({ label = '← Back' }) => { 
  const nav = useNavigate(); 
  return <button className="back" style={{ border: '1px solid #222', borderRadius: 5, padding: '5px 10px', background: '#fff', marginBottom: 14 }} onClick={() => nav(-1)}>{label}</button>; 
};

export function History() {
  const nav = useNavigate(), [f, setF] = useState({ q: '', year: '', semester: '', department: '' }), [rows, setRows] = useState([]), [p, setP] = useState([]);
  const { session, setSession } = useSemester(); // '' = current semester, or e.g. AS2026
  
  useEffect(() => { api('/admin/programs').then(setP); }, []);
  
  useEffect(() => { 
    api('/management/history?' + new URLSearchParams(Object.entries({ ...f, session }).filter(([, v]) => v))).then(setRows); 
  }, [f, session]);
  
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  
  return (
    <div className="mg">
      <h2 className="ttl" style={{ fontWeight: 400 }}>Attendance records -all student</h2>
      <SemesterPicker session={session} setSession={setSession} />
      <div className="hist">
        <input placeholder="Student ID/ Name" value={f.q} onChange={set('q')} style={{ borderRadius: 20, background: '#ece6f1', border: 0, width: 230 }} />
        <select value={f.year} onChange={set('year')}>
          <option value="">Year</option>
          {['First', 'Second', 'Third', 'Fourth'].map((y, i) => <option key={y} value={i + 1}>{y} Year</option>)}
        </select>
        <select value={f.semester} onChange={set('semester')}>
          <option value="">Semester</option>
          <option value="1">Semester 1</option>
          <option value="2">Semester 2</option>
        </select>
        <select value={f.department} onChange={set('department')}>
          <option value="">Department</option>
          {p.map((x) => <option key={x}>{x}</option>)}
        </select>
      </div>
      <div className="tbl">
        <table>
          <thead>
            <tr><th>Name</th><th>Module</th><th>Teacher</th><th>Attendance %</th><th>Date</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sid + r.mid}>
                <td>{r.name}</td>
                <td>{r.module}</td>
                <td>{r.teacher}</td>
                <td><span className={'pill ' + (r.pct >= 90 ? 'b' : 'o')}>{r.pct}%</span></td>
                <td><a className="view" style={{ color: 'var(--blue)' }} onClick={() => nav(`/history/${r.sid}/${r.mid}`)}>View</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function HistoryCalendar() {
  const { sid, mid } = useParams(), [mo, setMo] = useState(new Date()), [days, setDays] = useState({});
  const y = mo.getFullYear(), m = mo.getMonth(), key = `${y}-${String(m + 1).padStart(2, '0')}`;
  
  useEffect(() => { 
    api(`/management/calendar?student=${sid}&module=${mid}&month=${key}`).then(setDays); 
  }, [key, sid, mid]);
  
  const lead = new Date(y, m, 1).getDay(), weeks = Math.ceil((lead + new Date(y, m + 1, 0).getDate()) / 7), cells = Array.from({ length: weeks * 7 }, (_, i) => new Date(y, m, 1 - lead + i));
  
  return (
    <div className="mg">
      <Back label="← Back" />
      <h2 className="ttl" style={{ fontWeight: 400 }}>Attendance records -all student</h2>
      <div className="calbox">
        <div className="calhead">
          <button className="nav" onClick={() => setMo(new Date(y, m - 1, 1))}>‹</button>
          <b>{mo.toLocaleString('en', { month: 'long', year: 'numeric' })}</b>
          <button className="nav" onClick={() => setMo(new Date(y, m + 1, 1))}>›</button>
        </div>
        <div className="grid">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => <b key={d}>{d}</b>)}
          {cells.map((c, i) => (
            <div key={i} className={'day ' + (c.getMonth() === m ? days[c.getDate()] || '' : '')}>
              {c.getDate()}
            </div>
          ))}
        </div>
        <div className="legend">
          <span><i className="g" />Present</span>
          <span><i className="r" />Absent</span>
        </div>
      </div>
    </div>
  );
}