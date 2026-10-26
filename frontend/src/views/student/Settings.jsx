import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, logout } from '../../api';
import { passwordChecks, passwordOk } from '../../validation';
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
/* Profile photo (Sanskar's version): the picked image is shrunk to 160 x 160 in the
   browser and saved with the profile (prefs.photo) when the student clicks Save changes. */
const shrinkImage = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a valid image.'));
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        // crop the middle square of the image so it fills the circle
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

export default function Settings() {
  const nav = useNavigate();
  const [me, setMe] = useState(null);
  const [note, setNote] = useState({ text: '', ok: true });

  useEffect(() => {
    api('/me').then(setMe);
  }, []);

  if (!me) return null;

  const prefs = me.prefs || {};

  // Every toggle works the same way: it switches at once, saves, and says "Saved" (or switches back if saving failed).
  const tog = (k) => {
    if (k === 'sms' && !prefs.sms && !me.phone) {
      setNote({ text: 'Add your phone number in Edit profile details first, then turn SMS on.', ok: false });
      return;
    }
    const p = { ...prefs, [k]: !prefs[k] };
    setMe({ ...me, prefs: p });
    setNote({ text: 'Saving…', ok: true });
    api('/me', { prefs: p }, 'PUT')
      .then(() => setNote({ text: 'Saved.', ok: true }))
      .catch((x) => { setMe({ ...me, prefs }); setNote({ text: x.message || 'Could not save. Try again.', ok: false }); });
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
    [
      'email',
      'Email notifications',
      `Every notification is also emailed to ${me.email || 'the email you signed up with'}.`,
    ],
    [
      'sms',
      'SMS alerts',
      me.phone
        ? `Notifications are texted to ${me.phone}. Password changes are always texted.`
        : 'Add a phone number in Edit profile details to get text messages.',
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
            {me.prefs?.photo ? <img className="av img" src={me.prefs.photo} alt="" /> : <div className="av">{initials(me.name)}</div>}
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
                <button
                  className={'tog ' + (prefs[k] ? 'on' : '')}
                  onClick={() => tog(k)}
                  role="switch"
                  aria-checked={!!prefs[k]}
                  aria-label={t}
                />
              </div>
            ))}
            {note.text && <p className={'savenote ' + (note.ok ? 'ok' : 'bad')} role="status">{note.text}</p>}
          </div>

          <div className="box">
            <hr className="blue" />
            <button
              className="logout"
              onClick={() => logout().then(() => nav('/login'))}
            >
              ⇥ Log out
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
  const [busy, setBusy] = useState(''); // 'photo' | 'save' while saving
  const [msg, setMsg] = useState({ text: '', ok: true });
  const [photo, setPhoto] = useState(null);
  const file = useRef(null);

  useEffect(() => {
    api('/me').then((u) => { setMe(u); setPhoto(u.prefs?.photo || null); });
  }, []);

  if (!me) return null;

  const set = (k) => (e) => { setMe({ ...me, [k]: e.target.value }); setMsg({ text: '', ok: true }); };

  // Photo: choose a file → shrink it → shows here; kept when "Save changes" is clicked
  const upload = (e) => {
    const pic = e.target.files?.[0];
    e.target.value = ''; // lets the same file be picked again later
    if (!pic) return;
    if (!pic.type.startsWith('image/')) return setMsg({ text: 'Please choose an image file (JPG or PNG).', ok: false });
    if (pic.size > 5 * 1024 * 1024) return setMsg({ text: 'That image is too big. Choose one under 5 MB.', ok: false });
    shrinkImage(pic)
      .then((url) => { setPhoto(url); setMsg({ text: 'New photo ready. Click "Save changes" to keep it.', ok: true }); })
      .catch((x) => setMsg({ text: x.message, ok: false }));
  };
  const removePhoto = () => {
    setPhoto(null);
    setMsg({ text: 'Photo removed. Click "Save changes" to keep this.', ok: true });
  };
  const save = () => {
    if (!me.name || me.name.trim().length < 2) return setMsg({ text: 'Enter your full name.', ok: false });
    if (me.phone && !/^\+?[\d\s-]{8,15}$/.test(me.phone)) return setMsg({ text: 'Phone number looks like 17123456 or +97517123456.', ok: false });
    setBusy('save');
    const prefs = { ...(me.prefs || {}) };
    prefs.photo = photo || ''; // '' tells the server to remove the photo
    api('/me', { name: me.name.trim(), phone: me.phone || '', prefs }, 'PUT')
      .then(() => { setMsg({ text: 'Changes saved.', ok: true }); setTimeout(() => nav('/settings'), 800); })
      .catch((x) => setMsg({ text: x.message, ok: false }))
      .finally(() => setBusy(''));
  };

  return (
    <div className="sub1">
      <Back />

      <div className="who2">
        {photo ? <img className="av dark img" src={photo} alt="Your profile photo" /> : <div className="av dark">{initials(me.name)}</div>}
        <input ref={file} type="file" accept="image/*" hidden onChange={upload} />
        <button className="ghost" onClick={() => file.current?.click()} disabled={!!busy}>
          {photo ? 'Change photo' : 'Add photo'}
        </button>
        {photo && (
          <button className="plain danger" onClick={removePhoto} disabled={!!busy}>Remove photo</button>
        )}
      </div>
      <small className="hint">Any image up to 5 MB. Click “Save changes” to keep it.</small>

      <div className="card1">
        <label>Full name</label>
        <input value={me.name || ''} onChange={set('name')} />

        <label>Student ID</label>
        <input value={me.userId} readOnly />
        <small>Issued by the college — cannot be edited</small>

        <label>College email</label>
        <input value={me.email || ''} readOnly />
        <small>Notifications and password-change alerts are emailed here.</small>

        <label>Phone number</label>
        <input value={me.phone || ''} onChange={set('phone')} placeholder="e.g. 17123456" type="tel" />
        <small>Used for SMS alerts, including password changes.</small>

        {msg.text && <p className={'savenote ' + (msg.ok ? 'ok' : 'bad')} role="status">{msg.text}</p>}

        <div className="acts">
          <button className="ghost" onClick={() => nav('/settings')} disabled={!!busy}>
            Cancel
          </button>
          <button className="enrolbtn" style={{ margin: 0 }} onClick={save} disabled={!!busy}>
            {busy === 'save' ? 'Saving…' : 'Save changes'}
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
  const [msg, setMsg] = useState({ text: '', ok: false });
  const [busy, setBusy] = useState(false);

  const rules = passwordChecks(f.next);

  const go = () => {
    if (!f.current) return setMsg({ text: 'Enter your current password.', ok: false });
    if (!passwordOk(f.next)) return setMsg({ text: 'The new password does not meet all the rules.', ok: false });
    if (f.next !== f.again) return setMsg({ text: 'New passwords do not match.', ok: false });
    setBusy(true);
    api('/me/password', f, 'PUT')
      .then(() => {
        setMsg({ text: 'Password updated. A confirmation was sent to your email (and phone, if one is saved).', ok: true });
        setF({ current: '', next: '', again: '' });
        setTimeout(() => nav('/settings'), 1800);
      })
      .catch((e) => setMsg({ text: e.message, ok: false }))
      .finally(() => setBusy(false));
  };

  const inp = (k, l, auto) => (
    <>
      <label>{l}</label>
      <input type="password" value={f[k]} autoComplete={auto} onChange={(e) => { setF({ ...f, [k]: e.target.value }); setMsg({ text: '', ok: false }); }} />
    </>
  );

  return (
    <div className="sub1">
      <Back />

      <div className="card1 wide">
        {inp('current', 'Current password', 'current-password')}
        {inp('next', 'New password', 'new-password')}
        {inp('again', 'Confirm new password', 'new-password')}

        <b className="must">Password must have</b>
        {rules.map(([t, ok]) => (
          <p key={t} className={'rule ' + (ok ? 'ok' : 'no')}>
            {ok ? '✓' : '✕'} {t}
          </p>
        ))}

        {msg.text && <p className={'savenote ' + (msg.ok ? 'ok' : 'bad')} role="status">{msg.text}</p>}

        <div className="acts">
          <button className="ghost" onClick={() => nav('/settings')} disabled={busy}>
            Cancel
          </button>
          <button className="enrolbtn" style={{ margin: 0 }} onClick={go} disabled={busy}>
            {busy ? 'Updating…' : 'Update password'}
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
            <span className={'pc ' + (m.pct == null ? '' : cls(m.pct))}>{m.pct == null ? '–' : `${Math.round(m.pct)}%`}</span>
          </div>
        ))}
      </div>

      <p className="foot">Module list and schedule are set by your programme registration.</p>
    </div>
  );
}

/* =========================================================
   Enrol: pick year, programme and semester → module cards → enter key → Join
   Each module card shows why it can or can't be joined (status pill).
   ========================================================= */
// Card status: [label, pill class]. Green = enrolled, purple = open, amber = waiting, grey = closed
const enrolState = (m) =>
  m.enrolled ? ['Enrolled', 'ok']
    : !m.tutor ? ['No tutor yet', 'wait']
      : !m.hasKey ? ['No key yet', 'wait']
        : !m.selfEnrol ? ['Closed', 'off']
          : ['Open', 'open'];

export function Enrol() {
  const [all, setAll] = useState(null);
  const [f, setF] = useState({ year: '', department: '', semester: '' });
  const [pick, setPick] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '', ok: false });

  const loadModules = () => api('/modules/browse').then((l) => setAll(Array.isArray(l) ? l : [])).catch(() => setAll([]));
  useEffect(() => {
    loadModules();
    // Start from the student's own programme and year (they can still change them)
    api('/me')
      .then((u) => setF((x) => ({ ...x, year: x.year || String(u.year || 1), department: x.department || u.programme || '' })))
      .catch(() => {});
  }, []);

  // Changing a filter clears the chosen module and the key
  const set = (k) => (e) => {
    setF({ ...f, [k]: e.target.value });
    setPick('');
    setKey('');
    setMsg({ text: '', ok: false });
  };

  const list = all || [];
  const depts = [...new Set(list.map((m) => m.department))].sort();
  const mods = list.filter(
    (m) => (!f.year || m.year === +f.year) && (!f.department || m.department === f.department) && (!f.semester || m.semester === +f.semester)
  );
  const chosen = list.find((m) => m.id === pick);

  const join = (e) => {
    e.preventDefault();
    if (!key.trim()) return setMsg({ text: 'Enter the enrolment key your tutor gave you.', ok: false });
    setBusy(true);
    api('/modules/enrol', { module: pick, key: key.trim() })
      .then((r) => { setMsg({ text: r.message || 'You joined the module.', ok: true }); setKey(''); loadModules(); })
      .catch((x) => setMsg({ text: x.message, ok: false }))
      .finally(() => setBusy(false));
  };

  return (
    <div className="sub1 en">
      <Back label="Back" />
      <h1>My Enroll Modules</h1>

      {/* Step 1: filters */}
      <ol className="en-steps">
        <li className="on">Choose your year, programme and semester</li>
        <li className={pick ? 'on' : ''}>Pick a module</li>
        <li className={chosen && !chosen.enrolled ? 'on' : ''}>Enter the key and join</li>
      </ol>

      <div className="en-filters">
        <div>
          <label>Year</label>
          <select className="en-select" value={f.year} onChange={set('year')}>
            <option value="">All years</option>
            {['First', 'Second', 'Third', 'Fourth'].map((y, i) => (
              <option key={y} value={i + 1}>{y} Year</option>
            ))}
          </select>
        </div>
        <div>
          <label>Programme</label>
          <select className="en-select" value={f.department} onChange={set('department')}>
            <option value="">All programmes</option>
            {depts.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label>Semester</label>
          <select className="en-select" value={f.semester} onChange={set('semester')}>
            <option value="">Both semesters</option>
            <option value="1">Semester 1</option>
            <option value="2">Semester 2</option>
          </select>
        </div>
      </div>

      {/* Step 2: module cards */}
      {all === null ? (
        <p className="foot">Loading modules…</p>
      ) : mods.length === 0 ? (
        <div className="en-empty">No modules found for this selection. Try another year, programme or semester.</div>
      ) : (
        <div className="en-grid">
          {mods.map((m) => {
            const [label, cls] = enrolState(m);
            return (
              <button
                type="button"
                key={m.id}
                className={'en-card' + (pick === m.id ? ' on' : '')}
                onClick={() => { setPick(m.id); setKey(''); setMsg({ text: '', ok: false }); }}
                aria-pressed={pick === m.id}
              >
                <span className={'en-pill ' + cls}>{label}</span>
                <small>{m.code}</small>
                <b>{m.name}</b>
                <small>{m.tutor ? `Tutor: ${m.tutor}` : 'Tutor not assigned yet'}</small>
              </button>
            );
          })}
        </div>
      )}
      {mods.length > 0 && mods.every((m) => enrolState(m)[1] === 'wait') && (
        <p className="foot">None of these modules can be joined yet: the admin assigns a tutor first, then the tutor sets an enrolment key.</p>
      )}

      {/* Step 3: enrolment key */}
      {chosen && (
        <form className="en-key" onSubmit={join}>
          <p className="en-picked">
            <b>{chosen.name}</b>
            <small>{chosen.code}{chosen.tutor ? ` · Tutor: ${chosen.tutor}` : ''}</small>
          </p>

          {chosen.enrolled ? (
            <p className="savenote ok">You are enrolled in this module.</p>
          ) : enrolState(chosen)[1] !== 'open' ? (
            <p className="savenote bad">
              {!chosen.tutor ? 'This module has no tutor yet. The admin assigns one first.'
                : !chosen.hasKey ? 'Your tutor has not set an enrolment key yet.'
                  : 'Self-enrolment is closed for this module. Ask your tutor to add you.'}
            </p>
          ) : (
            <>
              <label>Enrolment key</label>
              <input className="grey" placeholder="Key given by your teacher" value={key} onChange={(e) => { setKey(e.target.value); setMsg({ text: '', ok: false }); }} />
              <div className="en-acts">
                <button type="button" className="ghost" onClick={() => setPick('')} disabled={busy}>Cancel</button>
                <button className="join" disabled={busy || !key.trim()}>{busy ? 'Joining…' : 'Join the module'}</button>
              </div>
            </>
          )}
          {msg.text && <p className={'savenote ' + (msg.ok ? 'ok' : 'bad')} role="status">{msg.text}</p>}
        </form>
      )}
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

  const icons = ['var(--primary-tint)', 'var(--border)', 'var(--primary-soft)'];

  return (
    <div className="sub1" style={{ maxWidth: 760 }}>
      <Back label="back" />
      <h1 style={{ margin: '10px 0 14px' }}>My Modules</h1>

      {/* Filters */}
      <div className="pick4">
        <select value={f.year} onChange={set('year')}>
          <option value="">All years</option>
          {['First', 'Second', 'Third', 'Fourth'].map((y, i) => (
            <option key={y} value={i + 1}>
              {y} Year
            </option>
          ))}
        </select>

        <select value={f.semester} onChange={set('semester')}>
          <option value="">Both semesters</option>
          <option value="1">Semester 1</option>
          <option value="2">Semester 2</option>
        </select>

        <select value={f.department} onChange={set('department')}>
          <option value="">All programmes</option>
          {depts.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>

        <select value={f.module} onChange={set('module')}>
          <option value="">All modules</option>
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
              Enrol with key
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}