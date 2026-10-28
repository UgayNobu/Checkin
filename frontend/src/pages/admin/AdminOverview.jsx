import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import AddTutor from './AddTutor.jsx';
import TutorRequests from './TutorRequests.jsx';
import './adminoverview.css';

/* =========================================================
   Inline Dropdown — arrow always points down, never flips
   ========================================================= */
function Dropdown({ options, onSelect, placeholder = 'Select programme' }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handle = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const selected = options.find((o) => o === value);

  return (
    <div className="dd" ref={ref}>
      <button
        type="button"
        className={'dd-btn' + (open ? ' open' : '')}
        onClick={() => setOpen(!open)}
      >
        <span className={selected ? '' : 'dd-placeholder'}>
          {selected || placeholder}
        </span>
        <svg className="dd-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <ul className="dd-menu">
          {options.length === 0 ? (
            <li className="dd-empty">Loading…</li>
          ) : (
            options.map((opt) => (
              <li
                key={opt}
                className={'dd-option' + (opt === value ? ' selected' : '')}
                onClick={() => {
                  setValue(opt);
                  setOpen(false);
                  onSelect(opt);
                }}
              >
                <span>{opt}</span>
                {opt === value && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M20 6L9 17l-5-5"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/* =========================================================
   Admin Overview page
   ========================================================= */
export default function AdminOverview() {
  const nav = useNavigate();
  const [o, setO] = useState({});
  const [programmes, setProgrammes] = useState([]);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingProgrammes, setLoadingProgrammes] = useState(true);

  // Selected programme + which tab (students / teachers)
  const [selectedProgram, setSelectedProgram] = useState('');
  const [tab, setTab] = useState('students');

  // Data for the selected programme
  const [stu, setStu] = useState([]);
  const [tut, setTut] = useState([]);
  const [mods, setMods] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false); // "Add tutor" form open?

  // Load overview totals
  useEffect(() => {
    api('/admin/overview')
      .then(setO)
      .catch(() => {})
      .finally(() => setLoadingOverview(false));
  }, []);

  // Load programme list
  useEffect(() => {
    api('/admin/programs')
      .then((data) => setProgrammes(Array.isArray(data) ? data : []))
      .catch(() => setProgrammes([]))
      .finally(() => setLoadingProgrammes(false));
  }, []);

  // When a programme is selected, load its students + teachers + modules
  useEffect(() => {
    if (!selectedProgram) {
      setStu([]);
      setTut([]);
      setMods([]);
      return;
    }
    setDataLoading(true);

    const E = encodeURIComponent;
    Promise.all([
      api(`/admin/users?role=student&programme=${E(selectedProgram)}`).catch(() => []),
      api(`/admin/users?role=teacher`).catch(() => []),
      api(`/admin/modules?department=${E(selectedProgram)}`).catch(() => []),
    ])
      .then(([s, t, m]) => {
        const inProgramme = (x) =>
          x.programme === selectedProgram || x.department === selectedProgram;

        setStu((Array.isArray(s) ? s : []).filter(inProgramme));
        setTut(Array.isArray(t) ? t : []);
        setMods(Array.isArray(m) ? m : []);
      })
      .finally(() => setDataLoading(false));
  }, [selectedProgram]);

  const stats = [
    { label: 'Total Students', value: o.students },
    { label: 'Total Tutors', value: o.tutors },
    { label: 'Total Programs', value: o.programs },
  ];

  const views = [
    {
      title: 'Students view',
      text: 'See every student in a programme, their attendance, and remove accounts.',
      base: 'students',
    },
    {
      title: 'Tutors view',
      text: 'See every tutor in a programme with their staff ID, and remove accounts.',
      base: 'teachers',
    },
  ];

  // Remove user from database
  const removeUser = (x, role) => {
    const msg =
      `Remove the ${role} "${x.name}" (${x.userId}) permanently?\n\n` +
      `This will delete their account from the database. This cannot be undone.`;
    if (!window.confirm(msg)) return;

    api('/admin/users/' + x._id, {}, 'DELETE')
      .then(() => {
        setSelectedProgram((p) => p);
        const E = encodeURIComponent;
        Promise.all([
          api(`/admin/users?role=student&programme=${E(selectedProgram)}`).catch(() => []),
          api(`/admin/users?role=teacher`).catch(() => []),
        ]).then(([s, t]) => {
          const inProgramme = (x) =>
            x.programme === selectedProgram || x.department === selectedProgram;
          setStu((Array.isArray(s) ? s : []).filter(inProgramme));
          setTut(Array.isArray(t) ? t : []);
        });
      })
      .catch((err) => {
        console.error('Delete error:', err);
        alert('Failed to remove user: ' + (err.message || 'Unknown error'));
      });
  };

  const list = (tab === 'students' ? stu : tut).filter((x) =>
    ((x.name || '') + x.userId).toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="ao">
      <h2 className="ao-title">
        Admin <small>Overview</small>
      </h2>

      {/* Top: 3 stat cards */}
      <div className="ao-stats">
        {stats.map((s) => (
          <div className="ao-stat" key={s.label}>
            <small>{s.label}</small>
            <b>{loadingOverview ? '—' : (s.value || 0).toLocaleString()}</b>
          </div>
        ))}
      </div>

      {/* Admin creates a tutor account with the default password */}
      {adding && <AddTutor onClose={() => setAdding(false)} onCreated={() => api('/admin/overview').then(setO).catch(() => {})} />}

      {/* Tutors who signed up and wait for approval (hidden when there are none) */}
      <TutorRequests />
      {/* Middle: Students view + Tutors view */}
      <div className="ao-views">
        {views.map((v) => (
          <div className="ao-view" key={v.base}>
            <div className="ao-vhead">
              <h3>{v.title}</h3>
              {v.base === 'teachers' && (
                <button type="button" className="ao-addbtn" onClick={() => setAdding(true)}>+ Add tutor</button>
              )}
            </div>
            <p>{v.text}</p>
            <Dropdown
              options={programmes}
              placeholder={loadingProgrammes ? 'Loading…' : 'Select programme'}
              onSelect={(programme) => nav(`/${v.base}/${encodeURIComponent(programme)}`)}
            />
          </div>
        ))}
      </div>

      {/* Bottom: Programme detail (only when a programme is selected) */}
      {selectedProgram && (
        <div className="ao-detail">
          <div className="ao-detail-head">
            <h3>{selectedProgram}</h3>
            <button className="ao-close" onClick={() => setSelectedProgram('')}>
              ×
            </button>
          </div>

          {/* Stat strip: Students / Teachers / Modules */}
          <div className="ao-mini-stats">
            <div className="ao-mini">
              <small>Total Students</small>
              <b>{dataLoading ? '—' : stu.length}</b>
            </div>
            <div className="ao-mini">
              <small>Total Teachers</small>
              <b>{dataLoading ? '—' : tut.length}</b>
            </div>
            <div className="ao-mini">
              <small>Total Modules</small>
              <b>{dataLoading ? '—' : mods.length}</b>
            </div>
          </div>

          {/* Tabs + search */}
          <div className="ao-bar">
            <div className="ao-tabs">
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
          <div className="ao-tbl">
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
                {!dataLoading && list.length === 0 && (
                  <tr>
                    <td colSpan={5} className="ao-empty">
                      {tab === 'students'
                        ? 'No students found in this programme.'
                        : 'No teachers found.'}
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
                      <span className={'ao-st ' + (x.active ? 'act' : 'inact')}>
                        {x.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="ao-remove"
                        onClick={() =>
                          removeUser(x, tab === 'students' ? 'student' : 'teacher')
                        }
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}