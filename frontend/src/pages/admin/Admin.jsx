import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import '../teacher/staff.css';
import './admin.css';
const E = encodeURIComponent, R = ['I', 'II', 'III', 'IV'];
const Back = ({ label = '< Back' }) => { const nav = useNavigate(); return <button className="back" onClick={() => nav(-1)}>{label}</button>; };

export function Overview() {
  const nav = useNavigate(), [o, setO] = useState({}), [p, setP] = useState([]);
  useEffect(() => { api('/admin/overview').then(setO); api('/admin/programs').then(setP); }, []);
  const pick = (base) => <select className="prog" defaultValue="" onChange={(e) => e.target.value && nav(`/${base}/${E(e.target.value)}`)}><option value="">PROGRAM</option>{p.map((x) => <option key={x}>{x}</option>)}</select>;
  return (
    <div className="adm"><h2 className="ttl">Admin <small>Overview</small></h2>
      <div className="stats">{[['Total Students', o.students, `↑ ${o.newStudents || 0} this month`], ['Total Tutors', o.tutors, 'Active faculty'], ['Total Programs', o.programs]].map(([l, v, c]) =>
        <div className="stat" key={l}><small>{l}</small><b>{(v || 0).toLocaleString()}</b>{c && <span className="pill ok">{c}</span>}</div>)}</div>
      <h4>Students view</h4>{pick('students')}<h4 style={{ marginTop: 90 }}>Tutors view</h4>{pick('teachers')}</div>);
}

export function Years() {
  const { program } = useParams(), nav = useNavigate();
  return (<div className="adm"><Back /><h2 className="ttl">BE ({program})</h2>
    <div className="plist">{R.map((r, i) => <div className="prow" key={r} onClick={() => nav(`/students/${E(program)}/${i + 1}`)}>Year {r}</div>)}</div></div>);
}

function People({ role }) {
  const { program, year } = useParams(), [u, setU] = useState([]), stu = role === 'student';
  const load = () => api(`/admin/users?role=${role}&department=${E(program)}${stu ? '&year=' + year : ''}`).then(setU); useEffect(() => { load(); }, [program, year]);
  const patch = (x, b) => api('/admin/users/' + x._id, b, 'PATCH').then(load);
  return (
    <div className="adm"><Back /><h2 className="ttl">{stu ? `BE (${program})` : 'Admin'} <small>{stu ? `Year ${R[year - 1]}` : 'Teacher'}</small></h2>
      <div className="tbl"><table><thead><tr><th>NAME</th><th>ID</th><th>PROGRAM</th>{stu && <th>ATTENDANCE</th>}<th>ACTIONS</th></tr></thead>
        <tbody>{u.map((x) => <tr key={x._id} style={{ opacity: x.active ? 1 : .5 }}><td><b>{x.name}</b></td><td>{x.userId}</td><td>{x.department}</td>{stu && <td>{x.pct}%</td>}
          <td><button className="eb" onClick={() => { const n = prompt('Name', x.name); if (n) patch(x, { name: n }); }}>Edit</button>
            <button className="ab" onClick={() => patch(x, { active: !x.active })}>{x.active ? 'Deactivate' : 'Activate'}</button></td></tr>)}</tbody></table></div></div>);
}
export const Students = () => <People role="student" />;
export const Teachers = () => <People role="teacher" />;

export function Programs() {
  const nav = useNavigate(), [p, setP] = useState([]), load = () => api('/admin/programs').then(setP); useEffect(() => { load(); }, []);
  return (
    <div className="adm"><h2 className="ttl">Programs & Modules <small>Structure</small></h2>
      <div className="pbox"><h4 style={{ margin: '0 0 6px' }}>📘 Programs</h4>
        {p.map((x) => <div className="prow2" key={x}><b onClick={() => nav('/programs/' + E(x))}>{x}</b>
          <button className="eb" onClick={() => { const n = prompt('Rename program', x); if (n) api('/admin/programs', { from: x, to: n }, 'PUT').then(load); }}>Edit</button></div>)}
        <button className="dash" onClick={() => { const n = prompt('Program name'); if (n) api('/admin/programs', { name: n }).then(load); }}>+ Add New Program</button></div></div>);
}

export function ProgramYears() {
  const { program } = useParams(), nav = useNavigate(), [open, setOpen] = useState(0);
  return (
    <div className="adm"><Back /><h2 className="ttl">BE ({program})</h2>
      <div className="plist">{R.map((r, i) => <div key={r}><div className="prow" onClick={() => setOpen(open === i + 1 ? 0 : i + 1)}>Year {r}</div>
        {open === i + 1 && [1, 2].map((s) => <div className="sem" key={s}>Semester {R[s - 1]}<button className="eb" onClick={() => nav(`/programs/${E(program)}/${i + 1}/${s}`)}>Edit</button></div>)}</div>)}</div></div>);
}

export function SemesterModules() {
  const { program, year, semester } = useParams(), nav = useNavigate(), [m, setM] = useState([]), [q, setQ] = useState('');
  useEffect(() => { api(`/admin/modules?department=${E(program)}&year=${year}&semester=${semester}`).then(setM); }, [program, year, semester]);
  const go = (id) => nav(`/programs/${E(program)}/${year}/${semester}/module/${id}`);
  return (
    <div className="adm"><button className="topbtn" onClick={() => nav(-1)}>Back</button>
      <div className="search"><input placeholder="Hinted search text" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <span className="tabx">Year {R[year - 1]}: Semester {R[semester - 1]}</span>
      <div className="pbox" style={{ maxWidth: 300, borderRadius: '0 12px 12px 12px' }}><h4 style={{ margin: '0 0 6px' }}>📘 Modules</h4>
        {m.filter((x) => (x.code + x.name).toLowerCase().includes(q.toLowerCase())).map((x) => <div className="mod" key={x._id} onClick={() => go(x._id)}><b>{x.code} -</b> {x.name}</div>)}
        <button className="dash" onClick={() => go('new')}>+ Add New Module</button></div></div>);
}

export function ModuleForm() {
  const { program, year, semester, id } = useParams(), nav = useNavigate(), [f, setF] = useState({ name: '', code: '', tutorId: '', count: '' }), [t, setT] = useState([]), [err, setErr] = useState('');
  useEffect(() => {
    api('/admin/users?role=teacher').then(setT);
    if (id !== 'new') api(`/admin/modules?department=${E(program)}&year=${year}&semester=${semester}`).then((l) => { const x = l.find((y) => y._id === id); x && setF({ name: x.name, code: x.code, tutorId: x.tutor?.userId || '', count: x.count || '' }); });
  }, [id]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value }), tn = t.find((x) => x.userId === f.tutorId)?.name || '';
  const save = () => api(id === 'new' ? '/admin/modules' : '/admin/modules/' + id, { ...f, department: program, year, semester }, id === 'new' ? 'POST' : 'PUT').then(() => nav(-1)).catch((e) => setErr(e.message));
  const inp = (l, k, ro) => <><label>{l}</label><input value={ro ? tn : f[k]} readOnly={!!ro} onChange={ro ? undefined : set(k)} /></>;
  return (
    <div className="adm"><button className="topbtn" onClick={() => nav(-1)}>Back</button><div className="mform">{inp('Module Name', 'name')}{inp('Module Code', 'code')}{inp('Assign Tutor', 'tutorId')}{inp('Teacher Name', 'x', true)}{inp('Number of Modules', 'count')}
      <p className="err">{err}</p><button className="save" onClick={save}>Save</button></div></div>);
}
