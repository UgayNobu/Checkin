// Tutor: My Profile and Settings.
//  • Profile shows what the tutor gave when they signed up (name, staff ID, email,
//    department, programme). "Edit profile" lets them change name, email, phone and
//    designation. Department and programme are set at sign-up and changed by the admin.
//  • Settings → Account changes the password (PUT /me/password: checks the current
//    password, saves a new bcrypt hash in users.password_hash).
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { COLLEGE_EMAIL, PASSWORD_HINT, passwordChecks, passwordOk } from '../../validation';
import './profile.css';

const ini = (n = '') => n.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const NAME = /^[A-Za-z][A-Za-z .'-]*$/;
const PHONE = /^\+?[0-9 ]{8,15}$/;

/** Field checks for the edit form → { field: message } */
function check(f, oldEmail) {
  const e = {};
  const name = f.name.trim();
  if (name.length < 2) e.name = 'Enter your full name.';
  else if (!NAME.test(name)) e.name = 'Use letters only (spaces, dots, hyphens and apostrophes are fine).';
  const email = f.email.trim();
  if (!email) e.email = 'Enter your email.';
  else if (email.toLowerCase() !== (oldEmail || '').toLowerCase() && !COLLEGE_EMAIL.test(email)) e.email = 'Use your college email ending in @rub.edu.bt.';
  if (f.phone.trim() && !PHONE.test(f.phone.trim())) e.phone = 'Phone number: 8–15 digits, e.g. 17123456.';
  if (f.designation.trim().length > 60) e.designation = 'Keep it under 60 characters.';
  return e;
}

export function Profile() {
  const [me, setMe] = useState(null);
  const [mods, setMods] = useState([]);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(null);
  const [errs, setErrs] = useState({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef(null);

  useEffect(() => {
    api('/me').then(setMe).catch((e) => setErr(e.message));
    api('/teacher/modules').then((r) => setMods(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  if (!me) return err ? <p className="err">{err}</p> : <p className="mut">Loading profile…</p>;

  const joined = me.createdAt ? new Date(me.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '–';
  const startEdit = () => {
    setF({ name: me.name || '', email: me.email || '', phone: me.phone || '', designation: me.designation || '' });
    setErrs({}); setMsg(''); setErr(''); setEdit(true);
  };
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setErrs({ ...errs, [k]: undefined }); };

  const save = (e) => {
    e.preventDefault();
    const found = check(f, me.email);
    setErrs(found);
    if (Object.keys(found).length) return;
    setBusy(true); setErr('');
    api('/me', { name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), designation: f.designation.trim() }, 'PUT')
      .then((u) => { setMe(u); setEdit(false); setMsg('Profile saved.'); })
      .catch((x) => setErr(x.message))
      .finally(() => setBusy(false));
  };

  const upload = (e) => {
    const pic = e.target.files?.[0];
    e.target.value = '';
    if (!pic) return;
    if (pic.size > 2 * 1024 * 1024) return setErr('The photo must be 2 MB or smaller.');
    const fd = new FormData();
    fd.append('file', pic);
    setBusy(true); setErr(''); setMsg('');
    api('/me/avatar', fd).then((u) => { setMe(u); setMsg('Photo updated.'); }).catch((x) => setErr(x.message)).finally(() => setBusy(false));
  };
  const removePhoto = () => {
    setBusy(true); setErr(''); setMsg('');
    api('/me/avatar', null, 'DELETE').then((u) => { setMe(u); setMsg('Photo removed.'); }).catch((x) => setErr(x.message)).finally(() => setBusy(false));
  };

  const row = (label, value, note) => (
    <div className="pv" key={label}>
      <small>{label}</small>
      <b>{value || <span className="mut">Not added yet</span>}</b>
      {note && <em>{note}</em>}
    </div>
  );
  const input = (label, k, props = {}) => (
    <div className={'pe' + (errs[k] ? ' bad' : '')}>
      <label htmlFor={'pf-' + k}>{label}</label>
      <input id={'pf-' + k} value={f[k]} onChange={set(k)} aria-invalid={!!errs[k]} {...props} />
      {errs[k] && <span className="pe-err">{errs[k]}</span>}
    </div>
  );

  return (
    <div className="prof">
      <div className="pcard">
        {me.avatarUrl ? <img className="bigav img" src={me.avatarUrl} alt="" /> : <div className="bigav">{ini(me.name)}</div>}
        <b>{me.name}</b>
        <small>{[me.designation, me.department && `Dept. of ${me.department}`].filter(Boolean).join(' · ') || 'Tutor'}</small>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={upload} />
        <button className="ghost" onClick={() => file.current?.click()} disabled={busy}>{me.avatarUrl ? 'Change photo' : 'Add photo'}</button>
        {me.avatarUrl && <button className="linkb" onClick={removePhoto} disabled={busy}>Remove photo</button>}
        <div className="kv"><small>Staff ID</small><b>{me.userId}</b></div>
        <div className="kv"><small>Joined</small><b>{joined}</b></div>
      </div>

      <div className="pform">
        <div className="ph">
          <h3>{edit ? 'Edit profile' : 'Profile details'}</h3>
          {!edit && <button className="pbtn" onClick={startEdit}>Edit profile</button>}
        </div>

        {msg && <p className="pok" role="status">✓ {msg}</p>}
        {err && <p className="err">{err}</p>}

        {!edit ? (
          <div className="g2">
            {row('Full name', me.name)}
            {row('Staff ID', me.userId)}
            {row('Email', me.email)}
            {row('Phone', me.phone)}
            {row('Department', me.department)}
            {row('Programme', me.programme)}
            {row('Designation', me.designation)}
            {row('Modules assigned', mods.map((m) => m.code).join(', '), mods.length ? null : 'The admin assigns modules')}
          </div>
        ) : (
          <form onSubmit={save} noValidate>
            <div className="g2">
              {input('Full name', 'name', { autoComplete: 'name', maxLength: 100 })}
              {input('Email', 'email', { type: 'email', autoComplete: 'email' })}
              {input('Phone', 'phone', { type: 'tel', autoComplete: 'tel', placeholder: 'e.g. 17123456' })}
              {input('Designation', 'designation', { placeholder: 'e.g. Lecturer', maxLength: 60 })}
              {row('Staff ID', me.userId, 'Cannot be changed')}
              {row('Department', me.department, 'Ask the admin to change it')}
              {row('Programme', me.programme, 'Ask the admin to change it')}
            </div>
            <div className="pactions">
              <button className="pbtn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
              <button type="button" className="ghost" onClick={() => setEdit(false)} disabled={busy}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function TeacherSettings() {
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState('n');
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState({ text: '', ok: true });

  useEffect(() => { api('/me').then(setMe).catch(() => {}); }, []);
  // Still on the admin's default password → open the Account tab straight away
  useEffect(() => { if (me?.prefs?.mustChangePassword) setTab('a'); }, [me?.userId]);
  if (!me) return null;
  const prefs = me.prefs || {};
  // Same as every toggle in the app: switches at once, saves, then shows "Saved" (or switches back on an error).
  const tog = (k) => {
    if (k === 'sms' && !prefs.sms && !me.phone) return setNote({ text: 'Add your phone number in My Profile first, then turn SMS on.', ok: false });
    const p = { ...prefs, [k]: !prefs[k] };
    setMe({ ...me, prefs: p });
    setNote({ text: 'Saving…', ok: true });
    api('/me', { prefs: p }, 'PUT')
      .then(() => setNote({ text: 'Saved.', ok: true }))
      .catch((x) => { setMe({ ...me, prefs }); setNote({ text: x.message || 'Could not save. Try again.', ok: false }); });
  };
  const rows = [
    ['email', 'Email notifications', `Every notification (new modules, flagged check-ins, evidence requests, password changes) is emailed to ${me.email}.`],
    ['sms', 'SMS alerts', me.phone ? `Notifications are texted to ${me.phone}. Password changes are always texted.` : 'Add a phone number in My Profile to get text messages.'],
    ['push', 'In-app notifications', 'Show alerts in CheckIn for new requests and flagged check-ins.'],
  ];

  const setP = (k) => (e) => { setPw({ ...pw, [k]: e.target.value }); setErr(''); setMsg(''); };
  const match = pw.again === pw.next;
  const ready = pw.current && passwordOk(pw.next) && match && pw.next !== pw.current;
  const change = (e) => {
    e.preventDefault();
    if (!pw.current) return setErr('Enter your current password.');
    if (!passwordOk(pw.next)) return setErr('The new password doesn\'t meet the rules below.');
    if (!match) return setErr('The two new passwords don\'t match.');
    if (pw.next === pw.current) return setErr('The new password must be different from the current one.');
    setBusy(true);
    api('/me/password', { current: pw.current, next: pw.next }, 'PUT')
      .then(() => {
        setMsg('Password updated. A confirmation was sent to your email (and phone, if one is saved).');
        setPw({ current: '', next: '', again: '' });
        setMe({ ...me, prefs: { ...prefs, mustChangePassword: false } });
      })
      .catch((x) => setErr(x.message))
      .finally(() => setBusy(false));
  };
  const type = show ? 'text' : 'password';

  return (
    <div className="setbox">
      <div className="tabs">
        <button className={tab === 'n' ? 'on' : ''} onClick={() => setTab('n')}>Notification Settings</button>
        <button className={tab === 'a' ? 'on' : ''} onClick={() => setTab('a')}>Account</button>
      </div>
      {tab === 'n' ? (
        rows.map(([k, t, s]) => (
          <div className="srow" key={k}>
            <div><b>{t}</b><small>{s}</small></div>
            <button className={'sw ' + (prefs[k] ? 'on' : '')} onClick={() => tog(k)} role="switch" aria-checked={!!prefs[k]} aria-label={t} />
          </div>
        )).concat(note.text ? [<p key="note" className={'savenote ' + (note.ok ? 'ok' : 'bad')} role="status">{note.text}</p>] : [])
      ) : (
        <form className="pwform" onSubmit={change} noValidate>
          <h4>Change password</h4>
          {prefs.mustChangePassword && <p className="savenote bad">You are still using the default password from the admin. Please change it now.</p>}
          <label htmlFor="pw-cur">Current password</label>
          <input id="pw-cur" type={type} value={pw.current} onChange={setP('current')} autoComplete="current-password" />
          <label htmlFor="pw-new">New password</label>
          <input id="pw-new" type={type} value={pw.next} onChange={setP('next')} autoComplete="new-password" />
          <label htmlFor="pw-again">Type the new password again</label>
          <input id="pw-again" type={type} value={pw.again} onChange={setP('again')} autoComplete="new-password" />
          {pw.again && !match && <span className="pe-err">The passwords don't match.</span>}
          <label className="pwshow"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords</label>
          {pw.next ? (
            <ul className="pwrules">
              {passwordChecks(pw.next).map(([label, ok]) => <li key={label} className={ok ? 'ok' : ''}>{ok ? '✓' : '○'} {label}</li>)}
            </ul>
          ) : (
            <small className="mut">{PASSWORD_HINT}</small>
          )}
          {err && <p className="err">{err}</p>}
          {msg && <p className="pok" role="status">✓ {msg}</p>}
          <button className="pbtn" disabled={busy || !ready}>{busy ? 'Updating…' : 'Update password'}</button>
        </form>
      )}
    </div>
  );
}
