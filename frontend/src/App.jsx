import { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  Link,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { api, auth } from './api';
import './base.css';

import Landing from './pages/public/Landing.jsx';
import Register from './pages/public/Register.jsx';

import TDash from './pages/teacher/Dashboard.jsx';
import { Modules as TModules, ModuleKey, RecordModules } from './pages/teacher/Modules.jsx';
import { RecordStudents, RecordStudent } from './pages/teacher/Records.jsx';
import Reports from './pages/teacher/Reports.jsx';
import { Profile, TeacherSettings } from './pages/teacher/Profile.jsx';

import * as A from './pages/admin/Admin.jsx';
import * as M from './pages/management/Management.jsx';

import SharedEvidence, { Certificate } from './pages/shared/Evidence.jsx';

import StudentDash from './pages/student/Dashboard.jsx';
import StudentAttendance from './pages/student/Attendance.jsx';
import Evidence from './pages/student/Evidence.jsx';
import Settings, {
  EditProfile,
  ChangePassword,
  MyModules,
  Enrol,
  BrowseModules,
} from './pages/student/Settings.jsx';

/* =========================================================
   Sidebar navigation per role
   ========================================================= */
const NAV = {
  student: [
    ['/', 'Dashboard'],
    ['/attendance', 'Attendance'],
    ['/evidence', 'Evidence Document'],
    ['/settings', 'Settings'],
  ],
  teacher: [
    ['/', 'Dashboard'],
    ['/modules', 'My Modules'],
    ['/start', 'Start Attendance'],
    ['/records', 'Attendance Records'],
    ['/evidence', 'Evidence Document'],
    ['/reports', 'Reports & Analytics'],
    ['/profile', 'My Profile'],
    ['/settings', 'Settings'],
  ],
  admin: [
    ['/', 'Admin'],
    ['/programs', 'Program / Module'],
  ],
  management: [
    ['/', 'Management'],
    ['/module', 'Module'],
    ['/teachers', 'Teacher'],
    ['/evidence', 'Evidence Document'],
    ['/history', 'History'],
  ],
};

const FOOT = {
  student: 'College of Science and Technology',
  teacher: 'College of Science and Technology',
  admin: 'CST • Fair, Fast & Honest',
  management: 'CST • Fair, Fast & Honest',
};

/* =========================================================
   Login page (student + teacher)
   ========================================================= */
function Login() {
  const nav = useNavigate();
  const [p] = useSearchParams();
  const teacher = p.get('as') === 'teacher';

  const [f, setF] = useState({ userId: '', password: '' });
  const [err, setErr] = useState('');

  const go = (e) => {
    e.preventDefault();
    api('/auth/login', f)
      .then((d) => {
        if (teacher && d.user.role === 'student') {
          return setErr('This is a student account. Use the student login.');
        }
        if (!teacher && d.user.role === 'teacher') {
          return setErr('This is a teacher account. Use the teacher login.');
        }
        auth.set(d);
        nav('/');
      })
      .catch((x) => setErr(x.message));
  };

  return (
    <div className="login">
      {/* Left side */}
      {/* CHANGED LINE: teacher login photo */}
      <div className={'hero' + (teacher ? ' teacherlogin' : '')}>
        <div className="herologo">
          <img src="/logo.jpg" alt="" />
          <span>CheckIn</span>
        </div>
        <div>
          <h1>
            {teacher
              ? 'Manage your sessions and student attendance'
              : 'Student Attendance System'}
          </h1>
          <p>Sign in to access classes, tutor sessions, and your personal academic dashboard.</p>
        </div>
        <small>College of Science and Technology</small>
      </div>

      {/* Form card */}
      <form className="lcard" onSubmit={go}>
        <img className="cardlogo" src="/logo.jpg" alt="CST logo" />
        <h2>{teacher ? 'Teacher login' : 'CheckIn'}</h2>
        <p className="sub">College of Science and Technology</p>

        <label>{teacher ? 'Staff ID' : 'Student ID'}</label>
        <input
          value={f.userId}
          onChange={(e) => setF({ ...f, userId: e.target.value })}
        />

        <label>Password</label>
        <input
          type="password"
          value={f.password}
          onChange={(e) => setF({ ...f, password: e.target.value })}
        />

        <a className="fgt">Forgot password?</a>
        <p className="err">{err}</p>

        <button className={'btn ' + (teacher ? '' : 'purple')} style={{ width: '100%' }}>
          Log in
        </button>

        <p className="alt" style={{ textAlign: 'center', fontSize: 11 }}>
          {teacher ? 'New tutor? ' : 'No account? '}
          <Link to={'/register' + (teacher ? '?as=teacher' : '')}>Sign in</Link>
        </p>
        <p className="ok" style={{ fontSize: 11, textAlign: 'center' }}>
          Routes to the right dashboard after sign-in
        </p>
      </form>
    </div>
  );
}

/* =========================================================
   Notification bell (student dashboard)
   ========================================================= */
function Bell() {
  const [open, setOpen] = useState(false);
  const [l, setL] = useState([]);

  const load = () => api('/notifications').then(setL).catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const unread = l.filter((n) => !n.isRead).length;

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="bell"
        onClick={() => {
          setOpen(!open);
          load();
        }}
      >
        🔔{unread > 0 && <i className="dot" />}
      </button>

      {open && (
        <div className="bellpanel">
          {l.length ? (
            l.map((n) => (
              <p
                key={n.id}
                className={n.isRead ? '' : 'unread'}
                onClick={() => api(`/notifications/${n.id}/read`, {}, 'PUT').then(load)}
              >
                {n.message}
                <small>{n.category}</small>
              </p>
            ))
          ) : (
            <p>No notifications yet</p>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   Shell: sidebar + top bar + page area
   ========================================================= */
const SUB = {
  student: (u) => 'ID: ' + u.userId,
  teacher: () => 'Lecturer',
  management: () => 'Management',
};

function Shell({ user, children, title, sub }) {
  const nav = useNavigate();
  const [pend, setPend] = useState(0);
  const ini = user.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    if (user.role === 'teacher') {
      api('/evidence?status=pending')
        .then((l) => setPend(l.length))
        .catch(() => {});
    }
  }, [title]);

  return (
    <div className={'shell ' + user.role}>
      {/* Sidebar */}
      <aside className="side">
        <div className="brand">
          <img className="logo" src="/logo.jpg" alt="" /> CheckIn
          {user.role === 'admin' && (
            <small style={{ display: 'block', fontSize: 9, opacity: 0.5, fontWeight: 400, padding: 0 }}>
              Admin Panel
            </small>
          )}
        </div>

        <nav>
          {NAV[user.role].map(([to, l]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              {l}
              {to === '/evidence' && pend > 0 && <span className="nbadge">{pend}</span>}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={() => {
            auth.clear();
            nav('/login');
          }}
        >
          Log out
        </button>
        <small>{FOOT[user.role]}</small>
      </aside>

      {/* Main area */}
      <div className="main">
        {user.role !== 'admin' && title && (
          <header className="top">
            <div>
              <h2>{title}</h2>
              <p>{sub}</p>
            </div>

            <div className="me">
              {user.role === 'student' && title === 'Dashboard' && <Bell />}

              {user.role === 'teacher' && (
                <input
                  className="hsearch"
                  placeholder="🔍 Search..."
                  onKeyDown={(e) => e.key === 'Enter' && nav('/records')}
                />
              )}

              <div className="avatar">{ini}</div>
              <div>
                <b>{user.name}</b>
                <br />
                <small>{(SUB[user.role] || SUB.student)(user)}</small>
              </div>
            </div>
          </header>
        )}

        <div className="page">{children}</div>
      </div>
    </div>
  );
}

/* =========================================================
   Teacher: Start Attendance
   ========================================================= */
function TeacherStart() {
  const [mods, setMods] = useState([]);
  const [f, setF] = useState({ module: '', section: '', room: '', type: 'theory', hours: 1 });
  const [live, setLive] = useState(null);
  const [sid, setSid] = useState(null);

  useEffect(() => {
    api('/teacher/modules').then(setMods);
  }, []);

  useEffect(() => {
    if (!sid) return;
    const t = setInterval(() => api(`/sessions/${sid}/live`).then(setLive), 4000);
    api(`/sessions/${sid}/live`).then(setLive);
    return () => clearInterval(t);
  }, [sid]);

  const gen = () =>
    navigator.geolocation.getCurrentPosition((p) =>
      api('/sessions', { ...f, lat: p.coords.latitude, lng: p.coords.longitude }).then((s) =>
        setSid(s._id)
      )
    );

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      {/* Session details */}
      <div className="panel" style={{ flex: 1, marginTop: 0 }}>
        <h3>Session details</h3>

        <label>Module</label>
        <select value={f.module} onChange={set('module')}>
          <option value="">Select module</option>
          {mods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} – {m.name}
            </option>
          ))}
        </select>

        <label>Section</label>
        <input value={f.section} onChange={set('section')} />

        <label>Room</label>
        <input value={f.room} onChange={set('room')} />

        <label>Practical / theory</label>
        <select value={f.type} onChange={set('type')}>
          <option>theory</option>
          <option>practical</option>
        </select>

        <label>Total hour</label>
        <input type="number" value={f.hours} onChange={set('hours')} />

        <p>
          <small>Students can check in until the window closes.</small>
        </p>
        <button className="btn" style={{ width: '100%' }} onClick={gen}>
          Generate Check-in Code
        </button>
      </div>

      {/* Live code panel */}
      {live && (
        <div className="panel" style={{ flex: 1, marginTop: 0, textAlign: 'center' }}>
          <h2>{live.code}</h2>
          <small>Students enter this code in the CheckIn app to mark themselves present.</small>

          <div className="row" style={{ justifyContent: 'center', gap: 40, marginTop: 14 }}>
            <div>
              <b className="ok" style={{ fontSize: 22 }}>{live.checkedIn}</b>
              <br />
              <small>Checked in</small>
            </div>
            <div>
              <b className="err" style={{ fontSize: 22 }}>{live.absent}</b>
              <br />
              <small>Absent</small>
            </div>
          </div>

          {live.flagged.length > 0 && (
            <p className="err">
              Location check failed: {live.flagged.map((s) => s.name).join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   Routes per role: path -> [Component, title, subtitle]
   ========================================================= */
const Soon = () => <p>This screen is next in the build.</p>;

const PAGES = {
  student: {
    '/': [StudentDash, 'Dashboard', 'Track classes, attendance parameters and record'],
    '/attendance': [StudentAttendance, 'Attendance', 'Track classes, attendance parameters and record'],
    /* CHANGED LINE: title was 'Report Evidance' */
    '/evidence': [Evidence, 'Evidence Document', 'Submit and track official absence requests for academic modules'],
    '/evidence/:id': [Certificate, 'Medical Report', ''],
    '/settings': [Settings, 'Settings', ''],
    '/settings/profile': [EditProfile, 'Edit profile details', ''],
    '/settings/password': [ChangePassword, 'Change password', ''],
    '/settings/modules': [MyModules, 'My modules', ''],
    '/settings/enrol': [Enrol, 'My Enroll Modules', ''],
    '/settings/browse': [BrowseModules, 'My Modules', ''],
  },

  teacher: {
    '/': [TDash, 'Dashboard', 'Overview of your day'],
    '/modules': [TModules, 'My Modules', 'Modules you teach this semester'],
    '/modules/:id': [ModuleKey, 'My Modules', 'Modules you teach this semester'],
    '/start': [TeacherStart, 'Start Attendance', 'Generate a check-in code for your class'],
    '/records': [RecordModules, 'Attendance Records', 'History of past sessions'],
    '/records/:id': [RecordStudents, 'Attendance Records', ''],
    '/records/:id/:sid': [RecordStudent, 'Attendance Records', ''],
    '/evidence': [SharedEvidence, 'Evidence Document', 'Ask a colleague to cover a session'],
    '/evidence/:id': [Certificate, 'Medical Leave', ''],
    '/reports': [Reports, 'Reports & Analytics', 'How attendance is trending across your modules'],
    '/profile': [Profile, 'My Profile', 'Manage your personal and contact details'],
    '/settings': [TeacherSettings, 'Settings', 'Configure how Check.in works for you'],
  },

  management: {
    '/': [M.Overview, '', ''],
    '/module': [M.Departments, '', ''],
    '/department/:name': [M.Department, '', ''],
    '/module/:id': [M.ModuleView, '', ''],
    '/student/:id/:mid': [M.StudentView, '', ''],
    '/teachers': [M.TeacherList, '', ''],
    '/evidence': [SharedEvidence, 'Evidence Document', 'Ask a colleague to cover a session'],
    '/evidence/:id': [Certificate, 'Medical Report', ''],
    '/history': [M.History, '', ''],
    '/history/:sid/:mid': [M.HistoryCalendar, '', ''],
  },

  admin: {
    '/': [A.Overview, '', ''],
    '/students/:program': [A.Years, '', ''],
    '/students/:program/:year': [A.Students, '', ''],
    '/teachers/:program': [A.Teachers, '', ''],
    '/programs': [A.Programs, '', ''],
    '/programs/:program': [A.ProgramYears, '', ''],
    '/programs/:program/:year/:semester': [A.SemesterModules, '', ''],
    '/programs/:program/:year/:semester/module/:id': [A.ModuleForm, '', ''],
  },
};

/* =========================================================
   Private routes (after login)
   ========================================================= */
function Private() {
  const u = auth.get()?.user;

  if (!u || !NAV[u.role]) {
    auth.clear();
    return <Navigate to="/welcome" />;
  }

  const paths = [...new Set([...NAV[u.role].map((n) => n[0]), ...Object.keys(PAGES[u.role])])];

  return (
    <Routes>
      {paths.map((path) => {
        const [C, t, s] = PAGES[u.role][path] || [
          Soon,
          NAV[u.role].find((n) => n[0] === path)?.[1],
          '',
        ];
        return (
          <Route
            key={path}
            path={path}
            element={
              <Shell user={u} title={t} sub={s}>
                <C />
              </Shell>
            }
          />
        );
      })}
    </Routes>
  );
}

/* =========================================================
   App
   ========================================================= */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/welcome" element={<Landing />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<Private />} />
      </Routes>
    </BrowserRouter>
  );
}