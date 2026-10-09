import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import '../teacher/staff.css';
import '../student/attendance.css';
import './management.css';
const E = encodeURIComponent, GB = (d) => new Date(d).toLocaleDateString('en-GB');
const Stat = ({ l, v, chip, cls }) => <div className="stat"><small>{l}</small><b>{(v ?? 0).toLocaleString()}</b>{chip && <div><span className={'chip ' + (cls || 'g')}>{chip}</span></div>}</div>;
const Back = ({ label = '← Back to Dashboard' }) => { const nav = useNavigate(); return <button className="back" style={{ border: '1px solid #222', borderRadius: 5, padding: '5px 10px', background: '#fff', marginBottom: 14 }} onClick={() => nav(-1)}>{label}</button>; };

export function Overview() {
  const nav = useNavigate(), [d, setD] = useState(null); useEffect(() => { api('/management/overview').then(setD); }, []);
  if (!d) return null; const t = d.totals;
  return (
    <div className="mg"><h2 className="ttl">Overall View</h2>
      <div className="stats"><Stat l="Total Students" v={t.students} chip={`↑ ${t.newStudents} this month`} /><Stat l="Total Tutors" v={t.tutors} chip="Active faculty" /><Stat l="Total Modules" v={t.modules} /><Stat l="Below 80%" v={t.below80} chip="Needs review" cls="o" /></div>
      <h4>Department- wise Attendance</h4>
      <div className="tbl"><table><thead><tr><th>DEPARTMENT</th><th>STUDENTS</th><th>MODULES</th><th>ATTENDANCE</th><th /></tr></thead>
        <tbody>{d.departments.map((r) => <tr key={r.department}><td><b>{r.department}</b></td><td>{r.students}</td><td>{r.modules}</td><td>{r.attendance}%</td>
          <td><a className="view" style={{ color: 'var(--blue)' }} onClick={() => nav('/department/' + E(r.department))}>view</a></td></tr>)}</tbody></table></div></div>);
}

export function Departments() {
  const nav = useNavigate(), [p, setP] = useState([]); useEffect(() => { api('/admin/programs').then(setP); }, []);
  return <div className="mg"><h2 className="ttl">Module</h2>{p.map((x) => <div className="dept" key={x} onClick={() => nav('/department/' + E(x))}>{x}</div>)}</div>;
}

export function Department() {
  const { name } = useParams(), nav = useNavigate(), [d, setD] = useState(null), [year, setYear] = useState(''), [mod, setMod] = useState('');
  useEffect(() => { api('/management/department/' + E(name)).then(setD); }, [name]);
  if (!d) return null; const pts = d.trend.map((v, i) => `${i * 120},${80 - v * 0.8}`).join(' ');
  return (
    <div className="mg"><Back /><span className="crumb">Programs / <b>{name}</b></span><h2 className="ttl">{name} Attendance</h2>
      <div className="stats"><Stat l="Total Students" v={d.students} chip="Active Status" /><Stat l="Average Attendance" v={d.avg} chip="Target Exceeded" /><Stat l="Students At Risk" v={d.atRisk} chip="Below 80% Threshold" cls="r" /></div>
      <div className="trend"><div className="rowb" style={{ margin: 0 }}><b style={{ fontSize: 12 }}>Attendance Rate Trend</b><small>Goal: 85%</small></div>
        <svg viewBox="0 0 600 80" preserveAspectRatio="none"><polyline points={pts} fill="none" stroke="#1ea7e8" strokeWidth="1.5" /></svg>
        <div className="wk">{[1, 2, 3, 4, 5, 6].map((w) => <span key={w}>week {w}</span>)}</div></div>
      <div className="sel"><select value={year} onChange={(e) => setYear(e.target.value)}><option value="">YEAR</option>{[1, 2, 3, 4].map((y) => <option key={y} value={y}>YEAR - {y}</option>)}</select><br />
        <select style={{ width: '70%' }} value={mod} onChange={(e) => setMod(e.target.value)}><option value="">MODULE</option>{d.modules.filter((m) => !year || m.year === +year).map((m) => <option key={m.id} value={m.id}>{m.code} – {m.name}</option>)}</select>
        <button className="go" onClick={() => mod && nav('/module/' + mod)}>VIEW</button></div></div>);
}

export function ModuleView() {
  const { id } = useParams(), nav = useNavigate(), [d, setD] = useState(null); useEffect(() => { api('/management/module/' + id).then(setD); }, [id]);
  if (!d) return null;
  return (
    <div className="mg"><Back /><div className="stats"><Stat l="Total Students" v={d.totals.students} /><Stat l="Total Absence" v={d.totals.absence} /><Stat l="Total Approve/ Relief Request" v={d.totals.relief} /></div>
      <div className="tbl" style={{ maxWidth: 720 }}><table><thead><tr><th>NAME</th><th>STUDENT ID</th><th>ABSENT (H)</th><th>ATTENDANCE</th></tr></thead>
        <tbody>{d.rows.map((r) => <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/student/${r.id}/${id}`)}><td><b>{r.name}</b></td><td>{r.userId}</td><td>{r.absentH}hr</td><td>{r.pct}%</td></tr>)}</tbody></table></div></div>);
}

export function StudentView() {
  const { id, mid } = useParams(), [d, setD] = useState(null); useEffect(() => { api(`/management/student/${id}?module=${mid}`).then(setD); }, [id, mid]);
  if (!d) return null;
  return (
    <div className="mg"><Back /><div className="stats"><Stat l="Number of days present in class" v={d.present} /><Stat l="Number of days absent in class" v={d.absent} /><Stat l="Total classes taken" v={d.total} /></div>
      <div className="tbl" style={{ maxWidth: 420 }}><table><thead><tr><th>NAME</th><th>STUDENT ID</th><th>ATTENDANCE</th></tr></thead><tbody><tr><td><b>{d.student.name}</b></td><td>{d.student.userId}</td><td>{d.pct}%</td></tr></tbody></table></div>
      <h4 style={{ fontSize: 11 }}>ATTENDANCE HISTORY</h4>
      <div className="tbl" style={{ maxWidth: 360 }}><table><thead><tr><th>PRESENT</th><th>ABSENT</th></tr></thead>
        <tbody>{d.history.map((h, i) => <tr key={i}><td>{h.status === 'present' && GB(h.date)}</td><td>{h.status === 'absent' && <small>{GB(h.date)}</small>}</td></tr>)}</tbody></table></div></div>);
}

export function TeacherList() {
  const [d, setD] = useState(null); useEffect(() => { api('/management/teachers').then(setD); }, []);
  if (!d) return null;
  return (
    <div className="mg"><h2 className="ttl">Teacher</h2><div className="stat" style={{ marginBottom: 24 }}><small>Total Teacher</small><b>{d.total}</b></div><h4 style={{ fontSize: 11 }}>All</h4>
      <div className="tbl" style={{ maxWidth: 560 }}><table><thead><tr><th>Module</th><th>Name</th><th>class</th><th>total class take</th></tr></thead>
        <tbody>{d.rows.map((r, i) => <tr key={i}><td>{r.module}</td><td>{r.name}</td><td className="mut">{r.cls}</td><td><span className="pill ok">{r.hours}hr</span></td></tr>)}</tbody></table></div></div>);
}

export function History() {
  const nav = useNavigate(), [f, setF] = useState({ q: '', year: '', semester: '', department: '' }), [rows, setRows] = useState([]), [p, setP] = useState([]);
  useEffect(() => { api('/admin/programs').then(setP); }, []);
  useEffect(() => { api('/management/history?' + new URLSearchParams(Object.entries(f).filter(([, v]) => v))).then(setRows); }, [f]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="mg"><h2 className="ttl" style={{ fontWeight: 400 }}>Attendance records -all student</h2>
      <div className="hist"><input placeholder="Student ID/ Name" value={f.q} onChange={set('q')} style={{ borderRadius: 20, background: '#ece6f1', border: 0, width: 230 }} />
        <select value={f.year} onChange={set('year')}><option value="">Year</option>{['First', 'Second', 'Third', 'Fourth'].map((y, i) => <option key={y} value={i + 1}>{y} Year</option>)}</select>
        <select value={f.semester} onChange={set('semester')}><option value="">Semester</option><option value="1">Semester 1</option><option value="2">Semester 2</option></select>
        <select value={f.department} onChange={set('department')}><option value="">Department</option>{p.map((x) => <option key={x}>{x}</option>)}</select></div>
      <div className="tbl"><table><thead><tr><th>Name</th><th>Module</th><th>Teacher</th><th>Attendance %</th><th>Date</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.sid + r.mid}><td>{r.name}</td><td>{r.module}</td><td>{r.teacher}</td><td><span className={'pill ' + (r.pct >= 90 ? 'b' : 'o')}>{r.pct}%</span></td>
          <td><a className="view" style={{ color: 'var(--blue)' }} onClick={() => nav(`/history/${r.sid}/${r.mid}`)}>View</a></td></tr>)}</tbody></table></div></div>);
}

export function HistoryCalendar() {
  const { sid, mid } = useParams(), [mo, setMo] = useState(new Date()), [days, setDays] = useState({});
  const y = mo.getFullYear(), m = mo.getMonth(), key = `${y}-${String(m + 1).padStart(2, '0')}`;
  useEffect(() => { api(`/management/calendar?student=${sid}&module=${mid}&month=${key}`).then(setDays); }, [key, sid, mid]);
  const lead = new Date(y, m, 1).getDay(), weeks = Math.ceil((lead + new Date(y, m + 1, 0).getDate()) / 7), cells = Array.from({ length: weeks * 7 }, (_, i) => new Date(y, m, 1 - lead + i));
  return (
    <div className="mg"><Back label="← Back" /><h2 className="ttl" style={{ fontWeight: 400 }}>Attendance records -all student</h2>
      <div className="calbox"><div className="calhead"><button className="nav" onClick={() => setMo(new Date(y, m - 1, 1))}>‹</button><b>{mo.toLocaleString('en', { month: 'long', year: 'numeric' })}</b><button className="nav" onClick={() => setMo(new Date(y, m + 1, 1))}>›</button></div>
        <div className="grid">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => <b key={d}>{d}</b>)}{cells.map((c, i) => <div key={i} className={'day ' + (c.getMonth() === m ? days[c.getDate()] || '' : '')}>{c.getDate()}</div>)}</div>
        <div className="legend"><span><i className="g" />Present</span><span><i className="r" />Absent</span></div></div></div>);
}
