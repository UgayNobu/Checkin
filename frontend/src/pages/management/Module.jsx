import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import '../teacher/staff.css';
import '../student/attendance.css';
import './Module.css';

const E = encodeURIComponent, GB = (d) => new Date(d).toLocaleDateString('en-GB');

const Stat = ({ l, v, chip, cls }) => (
  <div className="stat">
    <small>{l}</small>
    <b>{v || '-'}</b>
    {chip && <div><span className={'chip ' + (cls || 'g')}>{chip}</span></div>}
  </div>
);

const Back = ({ label = '← Back' }) => { 
  const nav = useNavigate(); 
  return <button className="back-dash" onClick={() => nav(-1)}>{label}</button>; 
};

/* =========================================================
   Module List (Clicking "Module" in Sidebar)
   ========================================================= */
export function Departments() {
  const nav = useNavigate();
  const [p, setP] = useState([]); // Safe empty array default
  const [loading, setLoading] = useState(true);

  useEffect(() => { 
    api('/admin/programs')
      .then((data) => {
        setP(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading programs:", err);
        setLoading(false);
      }); 
  }, []);

  return (
    <div className="mg">
      <h2 className="ttl">Module</h2>
      {loading ? (
        <p style={{ color: '#64748b', fontSize: 13 }}>Loading departments...</p>
      ) : p.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: 13 }}>No departments found.</p>
      ) : (
        <div className="dept-grid">
          {p.map((x) => (
            <div className="dept" key={x} onClick={() => nav('/department/' + E(x))}>
              {x}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   Department View (The design from your screenshot)
   ========================================================= */
export function Department() {
  const { name } = useParams(), nav = useNavigate();
  const [year, setYear] = useState(''), [mod, setMod] = useState('');
  
  const [d, setD] = useState({ 
    students: null, 
    avg: null, 
    atRisk: null, 
    trend: [], 
    modules: [] 
  });

  useEffect(() => { 
    api('/management/department/' + E(name))
      .then((data) => setD(data))
      .catch((err) => console.error("API Error:", err));
  }, [name]);

  const pts = d.trend && d.trend.length > 0 
    ? d.trend.map((v, i) => `${i * 120},${Math.max(0, Math.min(80, 80 - (v - 70) * 1.5))}`).join(' ') // 70–100% fills the chart; lower values sit on the bottom line 
    : '0,80 600,80';

  return (
    <div className="mg">
      <div className="dept-header">
        <div>
          <div className="crumb">Programs / <b>{name}</b></div>
          <h2 className="ttl">{name} Attendance</h2>
        </div>
        <button className="back-dash" onClick={() => nav('/')}>
          ← Back to Dashboard
        </button>
      </div>

      <div className="stats">
        <Stat l="Total Students" v={d.students} chip="Active Status" cls="g" />
        <Stat l="Average Attendance" v={d.avg != null ? `${d.avg}%` : null} chip="Target Exceeded" cls="g" />
        <Stat l="Students At Risk" v={d.atRisk} chip="Below 80% Threshold" cls="r" />
      </div>

      <div className="trend-card">
        <div className="trend-header">
          <b>Attendance Rate Trend</b>
          <small>Goal: 85%</small>
        </div>
        <svg viewBox="0 0 600 80" preserveAspectRatio="none">
          <polyline points={pts} fill="none" stroke="#1ea7e8" strokeWidth="2" />
        </svg>
        <div className="trend-weeks">
          {[1, 2, 3, 4, 5, 6].map((w) => <span key={w}>week {w}</span>)}
        </div>
      </div>

      <div className="selectors-card">
        <select value={year} onChange={(e) => setYear(e.target.value)} className="year-select">
          <option value="">YEAR -</option>
          {[1, 2, 3, 4].map((y) => <option key={y} value={y}>YEAR - {y}</option>)}
        </select>
        
        <select value={mod} onChange={(e) => setMod(e.target.value)} className="module-select">
          <option value="">MODULE</option>
          {(d.modules || []).filter((m) => !year || m.year === +year).map((m) => (
            <option key={m.id} value={m.id}>{m.code} – {m.name}</option>
          ))}
        </select>

        <button className="go-btn" onClick={() => mod && nav('/module/' + mod)}>
          VIEW
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   Module & Student Drill-down Views
   ========================================================= */
export function ModuleView() {
  const { id } = useParams(), nav = useNavigate(), [d, setD] = useState(null);

  useEffect(() => { api('/management/module/' + id).then(setD).catch(console.error); }, [id]);

  if (!d) return <div className="mg"><p style={{fontSize: 13, color: '#64748b'}}>Loading module data...</p></div>;

  return (
    <div className="mg">
      <Back />
      <div className="stats">
        <Stat l="Total Students" v={d.totals?.students} />
        <Stat l="Total Absence" v={d.totals?.absence} />
        <Stat l="Approved Evidence Documents" v={d.totals?.evidence} />
      </div>
      <div className="tbl" style={{ maxWidth: 720, marginTop: 20 }}>
        <table>
          <thead>
            <tr><th>NAME</th><th>STUDENT ID</th><th>ABSENT (H)</th><th>ATTENDANCE</th></tr>
          </thead>
          <tbody>
            {d.rows?.map((r) => (
              <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/student/${r.id}/${id}`)}>
                <td><b>{r.name}</b></td>
                <td>{r.userId}</td>
                <td>{r.absentH}hr</td>
                <td>{r.pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StudentView() {
  const { id, mid } = useParams(), [d, setD] = useState(null);

  useEffect(() => { api(`/management/student/${id}?module=${mid}`).then(setD).catch(console.error); }, [id, mid]);

  if (!d) return <div className="mg"><p style={{fontSize: 13, color: '#64748b'}}>Loading student data...</p></div>;

  return (
    <div className="mg">
      <Back />
      <div className="stats">
        <Stat l="Number of days present in class" v={d.present} />
        <Stat l="Number of days absent in class" v={d.absent} />
        <Stat l="Total classes taken" v={d.total} />
      </div>
      <div className="tbl" style={{ maxWidth: 420, marginTop: 20 }}>
        <table>
          <thead>
            <tr><th>NAME</th><th>STUDENT ID</th><th>ATTENDANCE</th></tr>
          </thead>
          <tbody>
            <tr><td><b>{d.student?.name}</b></td><td>{d.student?.userId}</td><td>{d.pct}%</td></tr>
          </tbody>
        </table>
      </div>
      <h4 style={{ fontSize: 11, marginTop: 24 }}>ATTENDANCE HISTORY</h4>
      <div className="tbl" style={{ maxWidth: 360 }}>
        <table>
          <thead>
            <tr><th>PRESENT</th><th>ABSENT</th></tr>
          </thead>
          <tbody>
            {d.history?.map((h, i) => (
              <tr key={i}>
                <td>{h.status === 'present' && GB(h.date)}</td>
                <td>{h.status === 'absent' && <small>{GB(h.date)}</small>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}