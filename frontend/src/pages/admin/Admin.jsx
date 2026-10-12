import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import '../teacher/staff.css';
import './admin.css';

/* =========================================================
   Admin pages
   - Overview          → AdminOverview.jsx (own file)
   - Programme people  → ProgramView.jsx   (own file)
   - This file: student list by year, programmes, semesters, modules
   ========================================================= */

/* ---------- Helpers ---------- */
const E = encodeURIComponent;
const ROMAN = ['I', 'II', 'III', 'IV'];

function Back({ label = '< Back' }) {
  const nav = useNavigate();
  return (
    <button className="back" onClick={() => nav(-1)}>
      {label}
    </button>
  );
}

/* =========================================================
   Students of one programme + year
   Route: /students/:program/:year
   ========================================================= */
export function Students() {
  const { program, year } = useParams();
  const [users, setUsers] = useState([]);

  const load = () =>
    api(`/admin/users?role=student&programme=${E(program)}&year=${year}`)
      .then((l) => setUsers(Array.isArray(l) ? l : []))
      .catch(() => setUsers([]));

  useEffect(() => {
    load();
  }, [program, year]);

  const patch = (x, body) => api('/admin/users/' + x._id, body, 'PATCH').then(load);

  const rename = (x) => {
    const n = prompt('Name', x.name);
    if (n) patch(x, { name: n });
  };

  return (
    <div className="adm">
      <Back />
      <h2 className="ttl">
        {program} <small>Year {ROMAN[year - 1]}</small>
      </h2>

      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>NAME</th>
              <th>ID</th>
              <th>PROGRAM</th>
              <th>ATTENDANCE</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {users.map((x) => (
              <tr key={x._id} style={{ opacity: x.active ? 1 : 0.5 }}>
                <td><b>{x.name}</b></td>
                <td>{x.userId}</td>
                <td>{x.programme || x.department}</td>
                <td>{x.pct ?? 0}%</td>
                <td>
                  <button className="eb" onClick={() => rename(x)}>Edit</button>
                  <button className="ab" onClick={() => patch(x, { active: !x.active })}>
                    {x.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =========================================================
   Programmes list
   Route: /programs
   ========================================================= */
export function Programs() {
  const nav = useNavigate();
  const [programs, setPrograms] = useState([]);

  const load = () =>
    api('/admin/programs')
      .then((l) => setPrograms(Array.isArray(l) ? l : []))
      .catch(() => setPrograms([]));

  useEffect(() => {
    load();
  }, []);

  const rename = (x) => {
    const n = prompt('Rename program', x);
    if (n) api('/admin/programs', { from: x, to: n }, 'PUT').then(load);
  };

  const add = () => {
    const n = prompt('Program name');
    if (n) api('/admin/programs', { name: n }).then(load);
  };

  return (
    <div className="adm">
      <h2 className="ttl">
        Programs & Modules <small>Structure</small>
      </h2>

      <div className="pbox">
        <h4 style={{ margin: '0 0 6px' }}>📘 Programs</h4>

        {programs.map((x) => (
          <div className="prow2" key={x}>
            <b onClick={() => nav('/programs/' + E(x))}>{x}</b>
            <button className="eb" onClick={() => rename(x)}>Edit</button>
          </div>
        ))}

        <button className="dash" onClick={add}>+ Add New Program</button>
      </div>
    </div>
  );
}

/* =========================================================
   Years → semesters of one programme
   Route: /programs/:program
   ========================================================= */
export function ProgramYears() {
  const { program } = useParams();
  const nav = useNavigate();
  const [open, setOpen] = useState(0);

  return (
    <div className="adm">
      <Back />
      <h2 className="ttl">{program}</h2>

      <div className="plist">
        {ROMAN.map((r, i) => {
          const year = i + 1;
          return (
            <div key={r}>
              <div className="prow" onClick={() => setOpen(open === year ? 0 : year)}>
                Year {r}
              </div>

              {open === year &&
                [1, 2].map((s) => (
                  <div className="sem" key={s}>
                    Semester {ROMAN[s - 1]}
                    <button className="eb" onClick={() => nav(`/programs/${E(program)}/${year}/${s}`)}>
                      Edit
                    </button>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================
   Modules of one semester
   Route: /programs/:program/:year/:semester
   ========================================================= */
export function SemesterModules() {
  const { program, year, semester } = useParams();
  const nav = useNavigate();
  const [modules, setModules] = useState([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    api(`/admin/modules?department=${E(program)}&year=${year}&semester=${semester}`)
      .then((l) => setModules(Array.isArray(l) ? l : []))
      .catch(() => setModules([]));
  }, [program, year, semester]);

  const go = (id) => nav(`/programs/${E(program)}/${year}/${semester}/module/${id}`);
  const shown = modules.filter((x) => (x.code + x.name).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="adm">
      <button className="topbtn" onClick={() => nav(-1)}>Back</button>

      <div className="search">
        <input placeholder="Search modules" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <span className="tabx">
        Year {ROMAN[year - 1]}: Semester {ROMAN[semester - 1]}
      </span>

      <div className="pbox" style={{ maxWidth: 300, borderRadius: '0 12px 12px 12px' }}>
        <h4 style={{ margin: '0 0 6px' }}>📘 Modules</h4>

        {shown.map((x) => (
          <div className="mod" key={x._id} onClick={() => go(x._id)}>
            <b>{x.code} -</b> {x.name}
            <small style={{ display: 'block', color: x.tutor ? '#16a34a' : '#b45309' }}>
              {x.tutor ? `Tutor: ${x.tutor.name}` : 'No tutor assigned yet'}
            </small>
          </div>
        ))}

        <button className="dash" onClick={() => go('new')}>+ Add New Module</button>
      </div>
    </div>
  );
}

/* =========================================================
   Create / edit a module and assign its tutor
   Route: /programs/:program/:year/:semester/module/:id   (id = 'new' to create)
   ========================================================= */
export function ModuleForm() {
  const { program, year, semester, id } = useParams();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', code: '', tutorId: '', count: '' });
  const [tutors, setTutors] = useState([]);
  const [dept, setDept] = useState(''); // department that runs this programme
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/admin/users?role=teacher')
      .then((l) => setTutors(Array.isArray(l) ? l.filter((t) => t.active) : []))
      .catch(() => setTutors([]));
    api('/programs')
      .then((l) => setDept(l.find((p) => p.name === program)?.department?.name || ''))
      .catch(() => {});
    if (id !== 'new') {
      api(`/admin/modules?department=${E(program)}&year=${year}&semester=${semester}`).then((l) => {
        const x = l.find((y) => y._id === id);
        if (x) setF({ name: x.name, code: x.code, tutorId: x.tutor?.userId || '', count: x.count || '' });
      });
    }
  }, [id]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // Tutors from the programme's own department are listed first.
  // ("Computing Technologies" and "Computing Technologies Department" count as the same.)
  const norm = (d) => (d || '').toLowerCase().replace(/&/g, 'and').replace(/\s*department$/, '').trim();
  const sameDept = (t) => dept && norm(t.department) && (norm(t.department).includes(norm(dept)) || norm(dept).includes(norm(t.department)));
  const inDept = tutors.filter(sameDept), others = tutors.filter((t) => !sameDept(t));

  const save = () => {
    const isNew = id === 'new';
    api(
      isNew ? '/admin/modules' : '/admin/modules/' + id,
      { ...f, department: program, year, semester },
      isNew ? 'POST' : 'PUT'
    )
      .then(() => nav(-1))
      .catch((e) => setErr(e.message));
  };

  return (
    <div className="adm">
      <button className="topbtn" onClick={() => nav(-1)}>Back</button>

      <div className="mform">
        <label>Module Name</label>
        <input value={f.name} onChange={set('name')} />

        <label>Module Code</label>
        <input value={f.code} onChange={set('code')} />

        <label>Assign Tutor</label>
        <select value={f.tutorId} onChange={set('tutorId')}>
          <option value="">— Not assigned —</option>
          {inDept.length > 0 && (
            <optgroup label={`Tutors in ${dept}`}>
              {inDept.map((t) => <option key={t.userId} value={t.userId}>{t.name} ({t.userId})</option>)}
            </optgroup>
          )}
          {others.length > 0 && (
            <optgroup label={inDept.length ? 'Tutors in other departments' : 'All tutors'}>
              {others.map((t) => <option key={t.userId} value={t.userId}>{t.name} ({t.userId}){t.department ? ` · ${t.department}` : ''}</option>)}
            </optgroup>
          )}
        </select>
        <small style={{ color: '#64748b' }}>The tutor will see this module and can then set its enrolment key.</small>

        <label>Number of Modules</label>
        <input value={f.count} onChange={set('count')} />

        <p className="err">{err}</p>
        <button className="save" onClick={save}>Save</button>
      </div>
    </div>
  );
}