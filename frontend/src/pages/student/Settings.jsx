import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, auth } from '../../api';
import './settings.css';

const initials = (n = '') =>
  n
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const Back = ({ to = '/settings', label = 'Settings' }) => {
  const nav = useNavigate();
  return (
    <button className="back" onClick={() => nav(to)}>
      ← {label}
    </button>
  );
};

/* =========================================================
   Settings (main page)
   ========================================================= */
export default function Settings() {
  const nav = useNavigate();
  const [me, setMe] = useState(null);

  useEffect(() => {
    api('/me').then(setMe);
  }, []);

  if (!me) return null;

  const prefs = me.prefs || {};

  const tog = (k) => {
    const p = { ...prefs, [k]: !prefs[k] };
    setMe({ ...me, prefs: p });
    api('/me', { prefs: p }, 'PUT');
  };

  const links = [
    [
      'Edit profile details',
      'Update your display name, contact information, and academic bio.',
      '/settings/profile',
    ],
    [
      'Change passkey & password',
      'Ensure your secure student portal remains locked and secure.',
      '/settings/password',
    ],
    [
      'My enrolled module',
      'View and adjust registration for active academic courses.',
      '/settings/modules',
    ],
  ];

  const notes = [
    [
      'low',
      'Low Attendance Alerts',
      'Instant notification if attendance slips below critical 85% requirement.',
    ],
    [
      'evidence',
      'Update Evidence Details',
      'Get updates as soon as your submitted absence requests are processed.',
    ],
    [
      'reminders',
      'Check-in Reminders',
      'Receive class start notifications for real-time mobile check-ins.',
    ],
  ];

  return (
    <div className="set">
      <div className="cols">
        {/* Left: profile & account */}
        <div className="box">
          <h3>Profile & Account</h3>
          <p className="sub">
            Manage your personal academic identity, department credentials, and secure connections.
          </p>
          <hr />

          <div className="who">
            <div className="av">{initials(me.name)}</div>
            <div>
              <b>{me.name}</b> <span className="tag">ACTIVE STUDENT</span>
              <br />
              <small>
                Student ID: <b>{me.userId}</b> • {me.department}
              </small>
            </div>
          </div>

          {links.map(([t, s, to]) => (
            <div className="link" key={to} onClick={() => nav(to)}>
              <span className="ic" />
              <div>
                <b>{t}</b>
                <small>{s}</small>
              </div>
              <i>›</i>
            </div>
          ))}
        </div>

        {/* Right: notifications + log out */}
        <div className="side2">
          <div className="box">
            <h3>System Notifications</h3>
            <p className="sub">Stay updated on critical academic alerts.</p>
            <hr />

            {notes.map(([k, t, s]) => (
              <div className="note" key={k}>
                <div>
                  <b>{t}</b>
                  <small>{s}</small>
                </div>
                <button className={'tog ' + (prefs[k] ? 'on' : '')} onClick={() => tog(k)} />
              </div>
            ))}
          </div>

          <div className="box">
            <hr className="blue" />
            <button
              className="logout"
              onClick={() => {
                auth.clear();
                nav('/login');
              }}
            >
              ⇥ Log out of EduPortal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Edit profile
   ========================================================= */
export function EditProfile() {
  const nav = useNavigate();
  const [me, setMe] = useState(null);

  useEffect(() => {
    api('/me').then(setMe);
  }, []);

  if (!me) return null;

  const set = (k) => (e) => setMe({ ...me, [k]: e.target.value });

  return (
    <div className="sub1">
      <Back />

      <div className="who2">
        <div className="av dark">{initials(me.name)}</div>
        <button className="ghost">Change photo</button>
      </div>

      <div className="card1">
        <label>Full name</label>
        <input value={me.name || ''} onChange={set('name')} />

        <label>Student ID</label>
        <input value={me.userId} readOnly />
        <small>Issued by the college — cannot be edited</small>

        <label>College email</label>
        <input value={me.email || ''} readOnly />

        <label>Phone number</label>
        <input value={me.phone || ''} onChange={set('phone')} />

        <div className="acts">
          <button className="ghost" onClick={() => nav('/settings')}>
            Cancel
          </button>
          <button
            className="ghost"
            onClick={() =>
              api('/me', { name: me.name, phone: me.phone }, 'PUT').then(() => nav('/settings'))
            }
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Change password
   ========================================================= */
export function ChangePassword() {
  const nav = useNavigate();
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [msg, setMsg] = useState('');

  const rules = [
    ['At least 8 characters', f.next.length >= 8],
    ['One number', /\d/.test(f.next)],
    ['One symbol', /[^\w\s]/.test(f.next)],
  ];

  const go = () =>
    f.next !== f.again
      ? setMsg('New passwords do not match')
      : api('/me/password', f, 'PUT')
          .then(() => nav('/settings'))
          .catch((e) => setMsg(e.message));

  const inp = (k, l) => (
    <>
      <label>{l}</label>
      <input type="password" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </>
  );

  return (
    <div className="sub1">
      <Back />

      <div className="card1 wide">
        {inp('current', 'Current password')}
        {inp('next', 'New password')}
        {inp('again', 'Confirm new password')}

        <b className="must">Password must have</b>
        {rules.map(([t, ok]) => (
          <p key={t} className={'rule ' + (ok ? 'ok' : 'no')}>
            {ok ? '✓' : '✕'} {t}
          </p>
        ))}

        <p className="errm">{msg}</p>

        <div className="acts">
          <button className="ghost" onClick={() => nav('/settings')}>
            Cancel
          </button>
          <button className="plain" onClick={go}>
            Update password
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   My modules  (Enrolment button on its own row, module cards)
   ========================================================= */
export function MyModules() {
  const nav = useNavigate();
  const [d, setD] = useState([]);

  useEffect(() => {
    api('/student/dashboard').then(setD);
  }, []);

  const cls = (p) => (p >= 90 ? 'hi' : p >= 80 ? 'mid' : 'lo');

  return (
    <div className="sub1">
      {/* Row 1: back link */}
      <Back />

      {/* Row 2: enrolment button, on its own line */}
      <div className="mm-actions">
        <button className="enrolbtn" onClick={() => nav('/settings/enrol')}>
          Enrolment
        </button>
      </div>

      {/* Row 3: enrolled modules */}
      <h3 className="mm-title">
        Enrolled modules <span className="mm-count">{d.length}</span>
      </h3>

      <div className="mm-list">
        {d.map((m) => (
          <div className="mm-card" key={m.id}>
            <span className="circ">‹›</span>
            <div className="mm-info">
              <b>{m.name}</b>
              <small>{m.code}</small>
            </div>
            <span className={'pc ' + cls(m.pct)}>{Math.round(m.pct)}%</span>
          </div>
        ))}
      </div>

      <p className="foot">Module list and schedule are set by your programme registration.</p>
    </div>
  );
}

/* =========================================================
   Enrol: choose year > programme > semester > module, then key
   (CHANGED: step-by-step choice, Browse modules button removed)
   ========================================================= */
export function Enrol() {
  const [all, setAll] = useState([]);
  const [f, setF] = useState({ year: '', department: '', semester: '', module: '' });
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api('/modules/browse').then(setAll);
  }, []);

  // Changing an earlier choice clears the module and the key
  const set = (k) => (e) => {
    setF({ ...f, [k]: e.target.value, module: k === 'module' ? e.target.value : '' });
    if (k !== 'module') setKey('');
  };

  const depts = [...new Set(all.map((m) => m.department))];

  const mods = all.filter(
    (m) =>
      m.year === +f.year &&
      m.department === f.department &&
      m.semester === +f.semester
  );

  const ready = f.year && f.department && f.semester;
  const chosen = all.find((m) => m.id === f.module);

  return (
    <div className="sub1">
      <Back label="Back" />
      <h1>My Enroll Modules</h1>

      {/* Step 1: year */}
      <label>Year</label>
      <select className="en-select" value={f.year} onChange={set('year')}>
        <option value="">Select year</option>
        {['First', 'Second', 'Third', 'Fourth'].map((y, i) => (
          <option key={y} value={i + 1}>
            {y} Year
          </option>
        ))}
      </select>

      {/* Step 2: programme */}
      {f.year && (
        <>
          <label>Programme</label>
          <select className="en-select" value={f.department} onChange={set('department')}>
            <option value="">Select programme</option>
            {depts.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </>
      )}

      {/* Step 3: semester */}
      {f.year && f.department && (
        <>
          <label>Semester</label>
          <select className="en-select" value={f.semester} onChange={set('semester')}>
            <option value="">Select semester</option>
            <option value="1">Semester 1</option>
            <option value="2">Semester 2</option>
          </select>
        </>
      )}

      {/* Step 4: module */}
      {ready && (
        <>
          <label>Module</label>
          <select className="en-select" value={f.module} onChange={set('module')}>
            <option value="">Select module</option>
            {mods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} – {m.name}
              </option>
            ))}
          </select>
          {mods.length === 0 && <p className="foot">No modules found for this selection.</p>}
        </>
      )}

      {/* Step 5: enrolment key, only after a module is chosen */}
      {chosen && (
        <div className="en-key">
          <p className="en-picked">
            <b>{chosen.name}</b>
            <small>
              {chosen.code} · Section {chosen.section}
            </small>
          </p>

          <label>Enrolment Key</label>
          <input
            className="grey"
            placeholder="Key given by your teacher"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />

          <button
            className="join"
            onClick={() =>
              api('/modules/enrol', { key })
                .then((r) => setMsg(r.message))
                .catch((e) => setMsg(e.message))
            }
          >
            Join the module
          </button>
        </div>
      )}

      <p className="foot">{msg}</p>
    </div>
  );
}

/* =========================================================
   Browse modules
   ========================================================= */
export function BrowseModules() {
  const nav = useNavigate();
  const [all, setAll] = useState([]);
  const [f, setF] = useState({ year: '', semester: '', department: '', module: '' });

  useEffect(() => {
    api('/modules/browse').then(setAll);
  }, []);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const depts = [...new Set(all.map((m) => m.department))];

  const list = all.filter(
    (m) =>
      (!f.year || m.year === +f.year) &&
      (!f.semester || m.semester === +f.semester) &&
      (!f.department || m.department === f.department) &&
      (!f.module || m.id === f.module)
  );

  const icons = ['#ede9fe', '#dbeafe', '#d1fae5'];

  return (
    <div className="sub1" style={{ maxWidth: 760 }}>
      <Back label="back" />
      <h1 style={{ margin: '10px 0 14px' }}>My Modules</h1>

      {/* Filters */}
      <div className="pick4">
        <select value={f.year} onChange={set('year')}>
          <option value="">First Year</option>
          {['First', 'Second', 'Third', 'Fourth'].map((y, i) => (
            <option key={y} value={i + 1}>
              {y} Year
            </option>
          ))}
        </select>

        <select value={f.semester} onChange={set('semester')}>
          <option value="">Semester 1</option>
          <option value="1">Semester 1</option>
          <option value="2">Semester 2</option>
        </select>

        <select value={f.department} onChange={set('department')}>
          <option value="">department</option>
          {depts.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>

        <select value={f.module} onChange={set('module')}>
          <option value="">module</option>
          {all.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} – {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* Module cards */}
      <div className="mgrid">
        {list.map((m, i) => (
          <div className="mc" key={m.id}>
            <span className="mi" style={{ background: icons[i % 3] }} />
            <small>{m.code}</small>
            <b>{m.name}</b>
            <small>
              Section {m.section} · {m.students} students
            </small>
            <button className="pb" onClick={() => nav('/settings/enrol')}>
              Enrolment_key
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}