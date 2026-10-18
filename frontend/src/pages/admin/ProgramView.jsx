import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { StatusPill, StatusButton } from './AccountStatus';
import './programview.css';
import { PROGRAMME_DEPARTMENT, sameDept } from './programmes';

const E = encodeURIComponent;

export default function ProgramView({ focus = 'students' }) {
  const { program } = useParams();
  const nav = useNavigate();

  const [stu, setStu] = useState([]);
  const [tut, setTut] = useState([]);
  const [mods, setMods] = useState([]);
  const [tab, setTab] = useState(focus);
  const [q, setQ] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = () => {
    setLoaded(false);

    Promise.all([
      // 1. Students in this programme
      api(`/admin/users?role=student&programme=${E(program)}`).catch(() => []),
      // 2. All teachers
      api(`/admin/users?role=teacher`).catch(() => []),
      // 3. Modules of this programme (each carries its assigned tutor)
      api(`/admin/modules?department=${E(program)}`).catch(() => []),
    ])
      .then(([s, t, m]) => {
        // ---- Students ----
        const inProgramme = (x) =>
          x.programme === program || x.department === program;
        setStu((Array.isArray(s) ? s : []).filter(inProgramme));

        // ---- Modules ----
        const moduleList = Array.isArray(m) ? m : [];
        setMods(moduleList);

        // ---- Teachers ----
        // Collect the userId of every tutor assigned to a module
        // of this programme. This is the ONLY list of tutors that
        // belongs to this programme.
        const assignedTutorIds = new Set();
        moduleList.forEach((mod) => {
          const tid = mod.tutor?.userId;
          if (tid) assignedTutorIds.add(tid);
        });

        // Tutors who teach one of its modules, plus tutors of the department that runs
        // this programme (so a new tutor shows up here before the admin assigns a module)
        const dept = PROGRAMME_DEPARTMENT[program];
        const allTeachers = Array.isArray(t) ? t : [];
        setTut(allTeachers.filter((x) =>
          assignedTutorIds.has(x.userId) || x.programme === program || sameDept(x.department, program) || (dept && sameDept(x.department, dept))
        ));
      })
      .finally(() => setLoaded(true));
  };

  useEffect(() => { load(); }, [program]);
  useEffect(() => { setTab(focus); }, [focus]);

  const list = (tab === 'students' ? stu : tut).filter((x) =>
    ((x.name || '') + x.userId).toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="pv">
      <button className="pv-back" onClick={() => nav(-1)}>&lt; Back</button>
      <h2 className="pv-title">{program}</h2>

      {/* 3 stat cards */}
      <div className="pv-stats">
        <div
          className={'pv-stat' + (tab === 'students' ? ' on' : '')}
          onClick={() => setTab('students')}
        >
          <small>Total Students</small>
          <b>{loaded ? stu.length : '—'}</b>
        </div>

        <div
          className={'pv-stat' + (tab === 'teachers' ? ' on' : '')}
          onClick={() => setTab('teachers')}
        >
          <small>Total Teachers</small>
          <b>{loaded ? tut.length : '—'}</b>
        </div>

        <div className="pv-stat pv-stat-info">
          <small>Total Modules</small>
          <b>{loaded ? mods.length : '—'}</b>
        </div>
      </div>

      {/* Tabs + search */}
      <div className="pv-bar">
        <div className="pv-tabs">
          <button
            className={tab === 'students' ? 'on' : ''}
            onClick={() => setTab('students')}
          >
            Students
          </button>
          <button
            className={tab === 'teachers' ? 'on' : ''}
            onClick={() => setTab('teachers')}
          >
            Teachers
          </button>
        </div>
        <input
          placeholder="Search name or ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="pv-tbl">
        <table>
          <thead>
            {tab === 'students' ? (
              <tr>
                <th>NAME</th>
                <th>STUDENT ID</th>
                <th>ATTENDANCE</th>
                <th>STATUS</th>
                <th>ACTION</th>
              </tr>
            ) : (
              <tr>
                <th>STAFF ID</th>
                <th>NAME</th>
                <th>DEPARTMENT</th>
                <th>STATUS</th>
                <th>ACTION</th>
              </tr>
            )}
          </thead>
          <tbody>
            {loaded && list.length === 0 && (
              <tr>
                <td colSpan={5} className="pv-empty">
                  {tab === 'students'
                    ? 'No students found in this programme.'
                    : 'No teachers assigned to this programme yet.'}
                </td>
              </tr>
            )}
            {list.map((x) => (
              <tr key={x._id} className={x.active ? '' : 'off'}>
                {tab === 'students' ? (
                  <>
                    <td><b>{x.name}</b></td>
                    <td>{x.userId}</td>
                    <td>{x.pct == null ? '–' : `${x.pct}%`}</td>
                  </>
                ) : (
                  <>
                    <td>{x.userId}</td>
                    <td><b>{x.name}</b></td>
                    <td>{x.department || '–'}</td>
                  </>
                )}
                <td>
                  <StatusPill user={x} />
                </td>
                <td>
                  {/* Deactivate asks for a reason; nothing is deleted and it can be undone */}
                  <StatusButton user={x} role={tab === 'students' ? 'student' : 'teacher'} onDone={load} />
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