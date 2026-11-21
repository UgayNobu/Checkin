import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { api, auth, fileHref, logout, notice } from './api';
import './base.css';
import './vle.css';
import './phone.css';
import './pages/public/public.css';
import './motion.css';
import { useEntrances } from './motion';

/* ---------- Public pages ---------- */
import Landing from './pages/public/Landing.jsx';
import Register from './pages/public/Register.jsx';
import Forgot from './pages/public/Forgot.jsx';
import { validateLogin } from './validation';
import { Typing, Ticker, Field, Aurora } from './pages/public/Fx.jsx';

/* ---------- Teacher pages ---------- */
import TDash from './pages/teacher/Dashboard.jsx';
import { Modules as TModules, ModuleKey } from './pages/teacher/Modules.jsx';
import StartAttendance from './pages/teacher/StartAttendance.jsx';
import { RecordModules, RecordStudents, RecordStudent } from './pages/teacher/Records.jsx';
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
import ClassChanges from './pages/management/ClassChanges.jsx';
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
    ['/class-changes', 'Class changes'],
  ],
};

/* One footer for every role: one compact row (brand · contact · links) and the copyright line.
   On laptops it sits behind the page and is uncovered as you reach the bottom (reveal footer). */
function Footer() {
  return (
    <footer className="vfoot">
      <div className="vfoot-cols">
        <div className="vfoot-brand">
          <img src="/logo.jpg" alt="" />
          <div>
            <b>CheckIn</b>
            <span>Student Attendance System · College of Science and Technology, RUB</span>
          </div>
        </div>
        <div className="vfoot-contact">
          <span>Rinchending, Phuentsholing, Chukha · Post Box 450 · 21101</span>
          <a href="mailto:info.cst@rub.edu.bt">info.cst@rub.edu.bt</a>
        </div>
        <nav className="vfoot-links" aria-label="Links">
          <a href="https://www.cst.edu.bt" target="_blank" rel="noreferrer">College website</a>
          <a href="https://www.rub.edu.bt" target="_blank" rel="noreferrer">Royal University of Bhutan</a>
        </nav>
      </div>
      <div className="vfoot-bar">© {new Date().getFullYear()} CheckIn · College of Science and Technology, RUB. All rights reserved.</div>
    </footer>
  );
}

/* =========================================================
   Login page (student + teacher)
   ========================================================= */
function Login() {
  const nav = useNavigate();
  const [p] = useSearchParams();
  const teacher = p.get('as') === 'teacher';

  const [f, setF] = useState({ userId: '', password: '' });
  const [err, setErr] = useState(() => notice.take() || '');
  const [fe, setFe] = useState({});
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false); // logged in: the button turns into a tick, then the app opens
  const [shake, setShake] = useState(0); // wrong details: the card shakes

  const change = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setFe({ ...fe, [k]: '' }); setErr(''); };
  const fail = (text) => { setErr(text); setShake((n) => n + 1); };

  const go = (e) => {
    e.preventDefault();
    const v = validateLogin(f);
    setFe(v);
    if (Object.keys(v).length) return setShake((n) => n + 1);
    setBusy(true);
    api('/auth/login', { userId: f.userId.trim(), password: f.password })
      .then((d) => {
        if (teacher && d.user.role === 'student') return fail('This is a student account. Use the student login.');
        if (!teacher && d.user.role === 'teacher') return fail('This is a teacher account. Use the teacher login.');
        auth.set(d);
        setDone(true);
        setTimeout(() => nav('/'), 650);
      })
      .catch((x) => fail(x.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className={'login ' + (teacher ? 'tutor' : 'student')}>
      <div className={'hero' + (teacher ? ' teacherlogin' : '')}>
        <Aurora />
        <div className="herologo">
          <img src="/logo.jpg" alt="" />
          <span>CheckIn</span>
        </div>
        <div className="hero-copy">
          <span className="hero-eyebrow">{teacher ? 'TUTOR PORTAL' : 'STUDENT PORTAL'}</span>
          <h1>{teacher
            ? <><span className="ln">Take attendance</span> <span className="ln"><Typing words={['in seconds.', 'from your timetable.', 'without paper.']} /></span></>
            : <><span className="ln">Your attendance,</span> <span className="ln"><Typing words={['on your phone.', 'in every module.', 'always up to date.']} /></span></>}</h1>
          <p>{teacher
            ? 'Start a check-in from your timetable, see who is in class live, and keep every record in one place.'
            : 'Check in to class with a code, follow your attendance in every module and send absence requests.'}</p>
          <Ticker items={teacher
            ? ['⚡ A 6-character code opens check-in', '📍 Students are checked against the building', '📊 Reports update as students check in', '🔁 Swap or cover classes with other tutors']
            : ['🔢 Type the 6-character code from your tutor', '📍 Your location confirms you are in class', '📈 See your % against the 90% rule', '📄 Send an absence request with a document']} />
          <div className="hero-bar" />
        </div>
        <small>College of Science and Technology</small>
      </div>

      <form key={shake} className={'lcard' + (shake ? ' shake' : '')} onSubmit={go} noValidate>
        <a className="alt lback" onClick={() => nav('/welcome')}>← Back</a>

        <img className="cardlogo" src="/logo.jpg" alt="CST logo" />
        <h2>{teacher ? 'Tutor login' : 'Student login'}</h2>
        <p className="sub">College of Science and Technology</p>

        <Field
          label={teacher ? 'Staff ID' : 'Student ID'} hint={teacher ? 'e.g. CST-0142' : 'e.g. 02250368'}
          value={f.userId} onChange={change('userId')} error={fe.userId} autoComplete="username"
        />
        <Field
          label="Password" type={show ? 'text' : 'password'}
          value={f.password} onChange={change('password')} error={fe.password} autoComplete="current-password"
        />
        <div className="lrow">
          <label className="showpw">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show password
          </label>
          <Link className="fgt" to={'/forgot' + (teacher ? '?as=teacher' : '')}>Forgot password?</Link>
        </div>
        {err && <p className="err" role="alert">{err}</p>}

        <button className={'btn lbtn' + (done ? ' done' : '')} disabled={busy || done}>
          {done ? <span className="lbtn-ok">✓ Welcome</span> : busy ? <><i className="spin" /> Logging in…</> : 'Log in'}
        </button>

        <p className="alt">
          {teacher ? 'New tutor? ' : 'No account? '}
          <Link to={'/register' + (teacher ? '?as=teacher' : '')}>Sign up</Link>
        </p>
      </form>
    </div>
  );
}

/* =========================================================
   Notification bell
   ========================================================= */
// Where a notification should take you when clicked (null = nowhere)
const linkOf = (n, role) => {
  const m = n.message || '';
  if (/swap/i.test(m) && role === 'teacher') return '/timetable#swaps';
  if (/absence request|evidence/i.test(m)) return '/evidence';
  if (/extra class|cancelled|cover/i.test(m)) return role === 'management' ? '/class-changes' : '/timetable';
  return null;
};
const ago = (d) => {
  if (!d) return '';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
const BellIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

function Bell({ role }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState([]);
  const [fresh, setFresh] = useState(new Set()); // ids that were unread when the panel opened (kept highlighted)
  const [ring, setRing] = useState(false); // wiggle when something new arrives
  const seen = useRef(null);
  const closeTimer = useRef(null);
  const loc = useLocation();

  const load = () => api('/notifications').then((l) => setList(Array.isArray(l) ? l : [])).catch(() => {});
  // check for new notifications on every page change and every 30 seconds
  useEffect(() => { load(); }, [loc.pathname]);
  useEffect(() => { const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const unread = list.filter((n) => !n.isRead).length;
  // the bell rings when the number of new notifications goes up (and once on load if there are any)
  useEffect(() => {
    if (seen.current === null || unread > seen.current) {
      if (unread > 0) { setRing(true); const t = setTimeout(() => setRing(false), 2100); seen.current = unread; return () => clearTimeout(t); }
    }
    seen.current = unread;
    return undefined;
  }, [unread]);

  const show = () => {
    clearTimeout(closeTimer.current);
    if (open) return;
    setOpen(true);
    // opening = viewed: remember which ones were new, then mark them all read so the red dot goes
    const ids = list.filter((n) => !n.isRead).map((n) => n.id);
    setFresh(new Set(ids));
    if (ids.length) {
      setList((l) => l.map((n) => ({ ...n, isRead: true })));
      api('/notifications/read-all', {}).catch(() => {});
    }
  };
  // a short delay lets the mouse move from the bell down into the panel without it closing
  const hide = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => { setOpen(false); setFresh(new Set()); }, 250);
  };
  const go = (to) => { setOpen(false); nav(to); };

  return (
    <div className="bellwrap" onMouseEnter={show} onMouseLeave={hide}>
      <button
        className={'bell' + (ring ? ' ring' : '')}
        aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}
        aria-expanded={open}
        onClick={() => (open ? (clearTimeout(closeTimer.current), setOpen(false)) : show())}
      >
        <BellIcon />{unread > 0 && <i className="dot" />}
      </button>

      {open && (
        <div className="bellpanel" role="dialog" aria-label="Notifications">
          <div className="bellhead">Notifications{fresh.size > 0 && <span className="bellnew">{fresh.size} new</span>}</div>
          {list.length ? (
            list.map((n) => {
              const to = linkOf(n, role);
              return (
                <p key={n.id} className={(fresh.has(n.id) ? 'unread' : '') + (to ? ' link' : '')}
                  onClick={to ? () => go(to) : undefined} role={to ? 'link' : undefined} tabIndex={to ? 0 : undefined}
                  onKeyDown={to ? (e) => e.key === 'Enter' && go(to) : undefined}>
                  {n.message}
                  <small>{n.category}{n.createdAt ? ` · ${ago(n.createdAt)}` : ''}{to ? ' · Open →' : ''}</small>
                </p>
              );
            })
          ) : (
            <p className="bellempty">No notifications yet</p>
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

// VLE (Moodle-style) layout: top navbar with the main links (the rest under "More"),
// user menu on the right, page title under the navbar. Below 1100px the links move
// into a drawer opened by the menu button. Same pages and links as before.
const PRIMARY_COUNT = { student: 5, teacher: 5, admin: 3, management: 6 };

function Shell({ user, children, title, sub }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [pend, setPend] = useState(0);
  const [menu, setMenu] = useState(false); // drawer (small screens)
  const [more, setMore] = useState(false); // "More" dropdown
  const [userMenu, setUserMenu] = useState(false);

  // Latest profile (name + photo), reloaded on every page change
  // so a new photo or name shows in the top bar right after saving it.
  const [me, setMe] = useState(null);
  useEffect(() => {
    api('/me').then(setMe).catch(() => {});
  }, [loc.pathname]);
  // Check the account every 30 seconds and when the tab comes back into view, so someone the
  // admin deactivates or removes is logged out straight away (with a message), not only on their next click.
  useEffect(() => {
    const check = () => { if (document.visibilityState === 'visible') api('/me').then(setMe).catch(() => {}); };
    const t = setInterval(check, 30000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', check); };
  }, []);
  const name = me?.name || user.name;
  const photo = fileHref(me?.avatarUrl); // /api/files/… → full backend address, works on any port

  // Close menus after moving to another page
  useEffect(() => { setMenu(false); setMore(false); setUserMenu(false); }, [loc.pathname]);
  // Close dropdowns when clicking anywhere else
  useEffect(() => {
    if (!more && !userMenu) return;
    const close = (e) => { if (!e.target.closest?.('.vnav-more, .vuser')) { setMore(false); setUserMenu(false); } };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [more, userMenu]);

  const ini = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // Profile circle: photo if the user has one, otherwise the initials
  const avatar = (
    <span className="avatar" style={{ overflow: 'hidden' }}>
      {photo ? (
        <img
          src={photo}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }}
        />
      ) : (
        ini
      )}
    </span>
  );

  useEffect(() => {
    if (user.role === 'teacher') {
      api('/evidence?status=pending')
        .then((l) => setPend(l.length))
        .catch(() => {});
    }
  }, [title]);

  // Only students and tutors have a profile page
  const profilePath = { student: '/settings/profile', teacher: '/profile' }[user.role];
  const handleProfileClick = () => { setUserMenu(false); nav(profilePath); };
  const doLogout = () => logout().then(() => nav('/welcome'));

  // Cards and table rows rise in one after another on every page
  const pageRef = useRef(null);
  useEntrances(pageRef, loc.pathname);

  // Sliding underline under the active link
  const linksRef = useRef(null);
  const [ink, setInk] = useState(null);
  useLayoutEffect(() => {
    const place = () => {
      const box = linksRef.current;
      const a = box?.querySelector(':scope > a.active, :scope .vnav-more > button.active');
      setInk(a ? { x: a.offsetLeft, w: a.offsetWidth } : null);
    };
    place();
    window.addEventListener('resize', place);
    document.fonts?.ready?.then(place);
    return () => window.removeEventListener('resize', place);
  }, [loc.pathname]);

  const links = NAV[user.role];
  const n = PRIMARY_COUNT[user.role] || links.length;
  const primary = links.slice(0, n), extra = links.slice(n);
  const moreActive = extra.some(([to]) => loc.pathname === to || loc.pathname.startsWith(to + '/'));
  const link = ([to, label]) => (
    <NavLink key={to} to={to} end={to === '/'}>
      {label}
      {to === '/evidence' && pend > 0 && <span className="nbadge">{pend}</span>}
    </NavLink>
  );

  return (
    <div className={'shell vle ' + user.role + (menu ? ' menu-open' : '')}>
      <header className="vnav">
        <button className="vnav-burger" aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu} onClick={() => setMenu(!menu)}>
          <span /><span /><span />
        </button>
        <NavLink to="/" end className="vbrand">
          <img className="logo" src="/logo.jpg" alt="" />
          <span>CheckIn<small>College of Science &amp; Technology</small></span>
        </NavLink>

        <nav className={'vnav-links' + (ink ? ' has-ink' : '')} aria-label="Main" ref={linksRef}>
          {ink && <i className="vnav-ink" style={{ width: ink.w, transform: `translateX(${ink.x}px)` }} aria-hidden="true" />}
          {primary.map(link)}
          {extra.length > 0 && (
            <div className="vnav-more">
              <button className={moreActive ? 'active' : ''} aria-haspopup="menu" aria-expanded={more} onClick={() => setMore(!more)}>
                More <i className="caret" />
              </button>
              {more && <div className="vmenu" role="menu">{extra.map(link)}</div>}
            </div>
          )}
        </nav>

        <div className="vnav-right">
          {['student', 'teacher', 'management'].includes(user.role) && <Bell role={user.role} />}
          <div className="vuser">
            <button aria-haspopup="menu" aria-expanded={userMenu} onClick={() => setUserMenu(!userMenu)} title={name}>
              {avatar}
              <span className="vuser-name">{name}<small>{(SUB[user.role] || (() => (user.role === 'admin' ? 'Admin' : '')))(user)}</small></span>
              <i className="caret" />
            </button>
            {userMenu && (
              <div className="vmenu right" role="menu">
                {profilePath && <button role="menuitem" onClick={handleProfileClick}>Profile</button>}
                <button role="menuitem" onClick={doLogout}>Log out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Small screens: the links in a drawer */}
      <div className="vshade" onClick={() => setMenu(false)} aria-hidden="true" />
      <aside className="vdrawer" aria-label="Menu">
        <div className="vdrawer-head">
          {avatar}
          <div><b>{name}</b><small>{(SUB[user.role] || (() => (user.role === 'admin' ? 'Admin' : '')))(user)}</small></div>
        </div>
        <nav>{links.map(link)}</nav>
        <button className="vdrawer-out" onClick={doLogout}>Log out</button>
      </aside>

      <div className="main">
        <div className="vbody">
          {user.role !== 'admin' && title && (
            <div className="vhead">
              <h1>{title}</h1>
              {sub && <p>{sub}</p>}
            </div>
          )}
          <div className="page" ref={pageRef}>{children}</div>
        </div>
        <Footer />
      </div>
    </div>
  );
}

/* =========================================================
   Routes per role
   ========================================================= */
const Soon = () => <p>This screen is next in the build.</p>;
const GoHome = () => <Navigate to="/" replace />;

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
    '/': [TDash, 'Dashboard', 'Your day, your classes and how attendance is trending'],
    '/timetable': [Timetable, 'Timetable', "Today's classes. Start attendance straight from your class"],
    '/modules': [TModules, 'My Modules', 'Modules you teach this semester'],
    '/modules/:id': [ModuleKey, 'My Modules', 'Modules you teach this semester'],
    '/start': [StartAttendance, 'Start Attendance', 'Generate a check-in code for your class'],
    '/records': [RecordModules, 'Attendance Records', 'History of past sessions'],
    '/records/:id': [RecordStudents, 'Attendance Records', ''],
    '/records/:id/:sid': [RecordStudent, 'Attendance Records', ''],
    '/evidence': [SharedEvidence, 'Evidence Document', 'Absence requests from students in your modules (view only)'],
    '/evidence/:id': [Certificate, 'Medical Leave', ''],
    '/reports': [GoHome, '', ''], // Reports & Analytics now live on the Dashboard
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
    '/class-changes': [ClassChanges, 'Class changes', 'Cancelled, covered and extra classes, and classes nobody took'],
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