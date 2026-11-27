// Settings for tutors, management and admin: one page, no tabs, using the full width.
//   Left:  Profile and email (the address notifications are emailed to) + the email switch
//   Right: Change password
// The bell always gets every notification. Email is sent only when the account has an email
// address and the switch is on (backend/src/services/notifications.service.js), so once a
// real address is saved here, emails start arriving with no other change.
import { useEffect, useState } from 'react';
import { api, keepNewToken } from '../../api';
import { COLLEGE_EMAIL, PASSWORD_HINT, passwordChecks, passwordOk } from '../../validation';
import './accountsettings.css';

const ROLE = { teacher: 'Tutor', management: 'Management', admin: 'Admin (ICT)', student: 'Student' };
// What each role is emailed about (kept short; the bell shows everything)
const EMAILED = {
  teacher: 'password changes, absence requests from your students being approved or declined, and students in your modules falling below 90% (checked daily).',
  management: 'password changes and new absence requests (evidence documents) waiting for your decision.',
  admin: 'password changes and new tutor account requests.',
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AccountSettings({ role }) {
  const [me, setMe] = useState(null);
  const [email, setEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/me').then((u) => { setMe(u); setEmail(u.email || ''); }).catch((e) => setErr(e.message)); }, []);
  if (!me) return err ? <p className="err">{err}</p> : <div className="skel skel-row" style={{ height: 160 }} />;

  // the server emails unless the switch was turned off, so "not set yet" counts as on
  const emailOn = me.prefs?.email !== false;
  const toggle = () => {
    const prefs = { ...(me.prefs || {}), email: !emailOn };
    setMe({ ...me, prefs });
    api('/me', { prefs }, 'PUT').catch(() => setMe(me));
  };

  const saveEmail = (e) => {
    e.preventDefault();
    const v = email.trim();
    setEmailMsg(''); setEmailErr('');
    if (!EMAIL.test(v)) return setEmailErr('Enter a valid email address.');
    // tutors use their college address (the same rule as on My Profile)
    if (role === 'teacher' && v.toLowerCase() !== (me.email || '').toLowerCase() && !COLLEGE_EMAIL.test(v)) return setEmailErr('Use your college email ending in @rub.edu.bt.');
    if (v.toLowerCase() === (me.email || '').toLowerCase()) return setEmailMsg('That is already your email.');
    setSavingEmail(true);
    api('/me', { email: v }, 'PUT')
      .then((u) => { setMe(u); setEmail(u.email || ''); setEmailMsg('Email saved. Notifications will also be emailed here.'); })
      .catch((x) => setEmailErr(x.message))
      .finally(() => setSavingEmail(false));
  };

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
      .then(keepNewToken) // other devices are logged out; this one stays logged in
      .then(() => { setMsg('Password updated. Use the new password next time you log in.'); setPw({ current: '', next: '', again: '' }); })
      .catch((x) => setErr(x.message))
      .finally(() => setBusy(false));
  };
  const type = show ? 'text' : 'password';

  return (
    <div className="acs">
      <div className="acs-col">
        <section className="acs-card">
          <h3>Profile and email</h3>
          <div className="acs-kv">
            <div><small>Name</small><b>{me.name}</b></div>
            <div><small>{role === 'student' ? 'Student ID' : 'Staff ID'}</small><b>{me.userId}</b></div>
            <div><small>Role</small><b>{ROLE[role] || role}</b></div>
          </div>
          <form className="acs-email" onSubmit={saveEmail} noValidate>
            <label htmlFor="acs-email">Email address</label>
            <div className="acs-inline">
              <input id="acs-email" type="email" value={email} autoComplete="email" placeholder="name@rub.edu.bt"
                onChange={(e) => { setEmail(e.target.value); setEmailMsg(''); setEmailErr(''); }} aria-invalid={!!emailErr} />
              <button className="pbtn" disabled={savingEmail || !email.trim()}>{savingEmail ? 'Saving…' : 'Save'}</button>
            </div>
            {emailErr && <span className="pe-err">{emailErr}</span>}
            {emailMsg && <p className="pok" role="status">✓ {emailMsg}</p>}
          </form>
        </section>

        <section className="acs-card">
          <div className="acs-switch">
            <div>
              <h3>Email notifications</h3>
              <p>Everything always appears under the bell. With this on, you are also emailed about {EMAILED[role] || 'important changes to your account.'}</p>
            </div>
            <button className={'sw ' + (emailOn ? 'on' : '')} onClick={toggle} aria-pressed={emailOn} aria-label="Email notifications" />
          </div>
        </section>
      </div>

      <section className="acs-card">
        <form className="pwform acs-pw" onSubmit={change} noValidate>
          <h3>Change password</h3>
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
      </section>
    </div>
  );
}
