import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import './programview.css';

const E = encodeURIComponent;

export default function ProgramView({ focus = 'students' }) {
  const { program } = useParams();
  const nav = useNavigate();
  const [stu, setStu] = useState([]);
  const [tut, setTut] = useState([]);
  const [tab, setTab] = useState(focus);
  const [q, setQ] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = () =>
    Promise.all([
      api(`/admin/users?role=student&programme=${E(program)}`),
      api(`/admin/users?role=teacher&programme=${E(program)}`),
    ])
      .then(([s, t]) => {
        // CHANGED: keep only people whose programme (or older department value) is this programme
        const inProgramme = (x) => x.programme === program || x.department === program;
        setStu((Array.isArray(s) ? s : []).filter(inProgramme));
        setTut((Array.isArray(t) ? t : []).filter(inProgramme));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));

  useEffect(() => { load(); }, [program]);
  useEffect(() => { setTab(focus); }, [focus]);

  const toggle = (x) => {
    const verb = x.active ? 'Deactivate' : 'Activate';
    if (!window.confirm(`${verb} ${x.name}?`)) return;
    api('/admin/users/' + x._id, { active: !x.active }, 'PATCH').then(load);
  };

  const list = (tab === 'students' ? stu : tut).filter((x) =>
    ((x.name || '') + x.userId).toLowerCase().includes(q.toLowerCase())
  );
  const active = (l) => l.filter((x) => x.active).length;

  return (
    <div className="pv">
      <button className="pv-back" onClick={() => nav(-1)}>&lt; Back</button>
      <h2 className="pv-title">{program}</h2>

      {/* Totals */}
      <div className="pv-stats">
        <div className={'pv-stat' + (tab === 'students' ? ' on' : '')} onClick={() => setTab('students')}>
          <small>Total Students</small>
          <b>{stu.length}</b>
          <span>{active(stu)} active</span>
        </div>
        <div className={'pv-stat' + (tab === 'teachers' ? ' on' : '')} onClick={() => setTab('teachers')}>
          <small>Total Teachers</small>
          <b>{tut.length}</b>
          <span>{active(tut)} active</span>
        </div>
      </div>

      {/* Tabs + search */}
      <div className="pv-bar">
        <div className="pv-tabs">
          <button className={tab === 'students' ? 'on' : ''} onClick={() => setTab('students')}>Students</button>
          <button className={tab === 'teachers' ? 'on' : ''} onClick={() => setTab('teachers')}>Teachers</button>
        </div>
        <input placeholder="Search name or ID" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {/* Table */}
      <div className="pv-tbl">
        <table>
          <thead>
            {tab === 'students' ? (
              <tr><th>NAME</th><th>STUDENT ID</th><th>ATTENDANCE</th><th>STATUS</th><th>ACTION</th></tr>
            ) : (
              <tr><th>STAFF ID</th><th>NAME</th><th>DEPARTMENT</th><th>STATUS</th><th>ACTION</th></tr>
            )}
          </thead>
          <tbody>
            {loaded && list.length === 0 && (
              <tr><td colSpan={5} className="pv-empty">No {tab} found in this programme.</td></tr>
            )}
            {list.map((x) => (
              <tr key={x._id} className={x.active ? '' : 'off'}>
                {tab === 'students' ? (
                  <>
                    <td><b>{x.name}</b></td>
                    <td>{x.userId}</td>
                    <td>{x.pct ?? 0}%</td>
                  </>
                ) : (
                  <>
                    <td>{x.userId}</td>
                    <td><b>{x.name}</b></td>
                    <td>{x.department || '–'}</td>
                  </>
                )}
                <td>
                  <span className={'pv-st ' + (x.active ? 'act' : 'inact')}>
                    {x.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <button className={x.active ? 'pv-deact' : 'pv-actv'} onClick={() => toggle(x)}>
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

export const ProgramStudents = () => <ProgramView focus="students" />;
export const ProgramTeachers = () => <ProgramView focus="teachers" />;