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
  useLocation,
} from 'react-router-dom';
import { api, auth, logout } from './api';
import './base.css';

/* ---------- Public pages ---------- */
import Landing from './pages/public/Landing.jsx';
import Register from './pages/public/Register.jsx';
import Forgot from './pages/public/Forgot.jsx';
import { validateLogin } from './validation';

/* ---------- Teacher pages ---------- */
import TDash from './pages/teacher/Dashboard.jsx';
import { Modules as TModules, ModuleKey } from './pages/teacher/Modules.jsx';
import StartAttendance from './pages/teacher/StartAttendance.jsx';
import { RecordModules, RecordStudents, RecordStudent } from './pages/teacher/Records.jsx';
import Reports from './pages/teacher/Reports.jsx';
import { Profile, TeacherSettings } from './pages/teacher/Profile.jsx';

/* ---------- Admin pages ---------- */
import AdminOverview from './pages/admin/AdminOverview.jsx';
import { ProgramStudents, ProgramTeachers } from './pages/admin/ProgramView.jsx';
import * as A from './pages/admin/Admin.jsx';
import Semesters from './pages/admin/Semesters.jsx';

/* ---------- Management pages ---------- */
import { Overview as MOverview } from './pages/management/Overview.jsx';
import { Departments, Department, ModuleView, StudentView } from './pages/management/Module.jsx';
import { TeacherList } from './pages/management/Teacher.jsx';
import { History, HistoryCalendar } from './pages/management/History.jsx';

/* ---------- Shared pages ---------- */
import SharedEvidence, { Certificate } from './pages/shared/Evidence.jsx';
import Timetable from './pages/shared/Timetable.jsx';

/* ---------- Student pages ---------- */
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
    ['/timetable', 'Timetable'],
    ['/attendance', 'Attendance'],
    ['/evidence', 'Evidence Document'],
    ['/settings', 'Settings'],
  ],
  teacher: [
    ['/', 'Dashboard'],
    ['/timetable', 'Timetable'],
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
    ['/semesters', 'Semesters'],
  ],
  management: [
    ['/', 'Management'],
    ['/module', 'Programs'],
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
  const [fe, setFe] = useState({});
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const change = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setFe({ ...fe, [k]: '' }); setErr(''); };

  const go = (e) => {
    e.preventDefault();
    const v = validateLogin(f);
    setFe(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    api('/auth/login', { userId: f.userId.trim(), password: f.password })
      .finally(() => setBusy(false))
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
      <div className={'hero' + (teacher ? ' teacherlogin' : '')}>
        <div className="herologo">
          <img src="/logo.jpg" alt="" />
          <span>CheckIn</span>
        </div>
        <div>
          <h1>{teacher ? 'Manage your sessions and student attendance' : 'Student Attendance System'}</h1>
          <p>Sign in to access classes, tutor sessions, and your personal academic dashboard.</p>
        </div>
        <small>College of Science and Technology</small>
      </div>

      <form className="lcard" onSubmit={go}>
        {/* ← Back button (goes to landing page) */}
        <a
          className="alt"
          onClick={() => nav('/welcome')}
          style={{ display: 'block', textAlign: 'left', cursor: 'pointer' }}
        >
          ← Back
        </a>

        <img className="cardlogo" src="/logo.jpg" alt="CST logo" />
        <h2>{teacher ? 'Teacher login' : 'CheckIn'}</h2>
        <p className="sub">College of Science and Technology</p>

        <label>{teacher ? 'Staff ID' : 'Student ID'}</label>
        <input
          value={f.userId}
          onChange={change('userId')}
          className={fe.userId ? 'bad' : ''}
          placeholder={teacher ? 'e.g. CST-0142' : 'e.g. 02250368'}
          autoComplete="username"
        />
        {fe.userId && <small className="ferr">{fe.userId}</small>}

        <label>Password</label>
        <input
          type={show ? 'text' : 'password'}
          value={f.password}
          onChange={change('password')}
          className={fe.password ? 'bad' : ''}
          autoComplete="current-password"
        />
        {fe.password && <small className="ferr">{fe.password}</small>}
        <label className="showpw">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show password
        </label>

        <Link className="fgt" to={'/forgot' + (teacher ? '?as=teacher' : '')}>Forgot password?</Link>
        {err && <p className="err">{err}</p>}

        <button className={'btn ' + (teacher ? '' : 'purple')} style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
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
   Notification bell
   ========================================================= */
function Bell() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState([]);

  const load = () => api('/notifications').then(setList).catch(() => {});

  useEffect(() => {
    load();
  }, []);

  const unread = list.filter((n) => !n.isRead).length;

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
          {list.length ? (
            list.map((n) => (
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
   Shell
   ========================================================= */
const SUB = {
  student: (u) => 'ID: ' + u.userId,
  teacher: () => 'Lecturer',
  management: () => 'Management',
};

function Shell({ user, children, title, sub }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [pend, setPend] = useState(0);
  const [menu, setMenu] = useState(false); // phone: sidebar drawer open?

  // Phone: close the menu after moving to another page
  useEffect(() => setMenu(false), [loc.pathname]);
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

  const handleProfileClick = () => {
    if (user.role === 'student') nav('/settings/profile');
    else if (user.role === 'teacher') nav('/profile');
    else nav('/');
  };

  return (
    <div className={'shell ' + user.role + (menu ? ' menu-open' : '')}>
      {/* Phone only: top bar with the menu button (the sidebar becomes a drawer) */}
      <div className="mbar">
        <button className="mbar-btn" aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu} onClick={() => setMenu(!menu)}>
          <span /><span /><span />
        </button>
        <img className="logo" src="/logo.jpg" alt="" />
        <b>CheckIn</b>
      </div>
      <div className="mshade" onClick={() => setMenu(false)} aria-hidden="true" />

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
          {NAV[user.role].map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              {label}
              {to === '/evidence' && pend > 0 && <span className="nbadge">{pend}</span>}
            </NavLink>
          ))}
        </nav>

        <button
          onClick={() => logout().then(() => nav('/login'))}
        >
          Log out
        </button>
        <small>{FOOT[user.role]}</small>
      </aside>

      <div className="main">
        {user.role !== 'admin' && title && (
          <header className="top">
            <div>
              <h2>{title}</h2>
              <p>{sub}</p>
            </div>

            <div className="me">
              {user.role === 'student' && title === 'Dashboard' && <Bell />}

              <div
                onClick={handleProfileClick}
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '5px 10px',
                  borderRadius: '8px',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                title="View Profile"
              >
                <div className="avatar">{ini}</div>
                <div>
                  <b>{user.name}</b>
                  <br />
                  <small>{(SUB[user.role] || SUB.student)(user)}</small>
                </div>
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
   Routes per role
   ========================================================= */
const Soon = () => <p>This screen is next in the build.</p>;

const PAGES = {
  student: {
    '/': [StudentDash, 'Dashboard', 'Track classes, attendance parameters and record'],
    '/timetable': [Timetable, 'Timetable', "Today's classes and your weekly timetable"],
    '/attendance': [StudentAttendance, 'Attendance', 'Track classes, attendance parameters and record'],
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
    '/timetable': [Timetable, 'Timetable', "Today's classes. Start attendance straight from your class"],
    '/modules': [TModules, 'My Modules', 'Modules you teach this semester'],
    '/modules/:id': [ModuleKey, 'My Modules', 'Modules you teach this semester'],
    '/start': [StartAttendance, 'Start Attendance', 'Generate a check-in code for your class'],
    '/records': [RecordModules, 'Attendance Records', 'History of past sessions'],
    '/records/:id': [RecordStudents, 'Attendance Records', ''],
    '/records/:id/:sid': [RecordStudent, 'Attendance Records', ''],
    '/evidence': [SharedEvidence, 'Evidence Document', 'Absence requests from students in your modules (view only)'],
    '/evidence/:id': [Certificate, 'Medical Leave', ''],
    '/reports': [Reports, 'Reports & Analytics', 'How attendance is trending across your modules'],
    '/profile': [Profile, 'My Profile', 'Manage your personal and contact details'],
    '/settings': [TeacherSettings, 'Settings', 'Configure how Check.in works for you'],
  },

  management: {
    '/': [MOverview, '', ''],
    '/module': [Departments, '', ''],
    '/department/:name': [Department, '', ''],
    '/module/:id': [ModuleView, '', ''],
    '/student/:id/:mid': [StudentView, '', ''],
    '/teachers': [TeacherList, '', ''],
    '/evidence': [SharedEvidence, 'Evidence Document', "Review and approve students' absence requests"],
    '/evidence/:id': [Certificate, 'Medical Report', ''],
    '/history': [History, '', ''],
    '/history/:sid/:mid': [HistoryCalendar, '', ''],
  },

  admin: {
    '/': [AdminOverview, '', ''],
    '/students/:program': [ProgramStudents, '', ''],
    '/students/:program/:year': [A.Students, '', ''],
    '/teachers/:program': [ProgramTeachers, '', ''],
    '/programs': [A.Programs, '', ''],
    '/semesters': [Semesters, '', ''],
    '/programs/:program': [A.ProgramYears, '', ''],
    '/programs/:program/:year/:semester': [A.SemesterModules, '', ''],
    '/programs/:program/:year/:semester/module/:id': [A.ModuleForm, '', ''],
  },
};

/* =========================================================
   Private routes
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
        const Component = C || Soon;
        return (
          <Route
            key={path}
            path={path}
            element={
              <Shell user={u} title={t} sub={s}>
                <Component />
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
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/*" element={<Private />} />
      </Routes>
    </BrowserRouter>
  );
}