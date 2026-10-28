// Forgot password: step 1 asks for the ID and emails a 6-digit code,
// step 2 takes the code and a new password.
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { passwordChecks, passwordOk, fieldFromServer } from '../../validation';
import './public.css';

export default function Forgot() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const teacher = params.get('as') === 'teacher';
  const back = '/login' + (teacher ? '?as=teacher' : '');

  const [step, setStep] = useState(1);
  const [f, setF] = useState({ userId: '', code: '', password: '', again: '' });
  const [fe, setFe] = useState({}); // per-field errors
  const [msg, setMsg] = useState({ text: '', ok: false });
  const [note, setNote] = useState(''); // shown when email isn't set up on the server yet
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const change = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setFe({ ...fe, [k]: '' }); };

  // Step 1: ask for a code
  const sendCode = (e) => {
    e?.preventDefault();
    if (!f.userId.trim()) return setFe({ userId: 'Enter your ID.' });
    setBusy(true);
    setMsg({ text: '', ok: false });
    api('/auth/forgot-password', { userId: f.userId.trim() })
      .then((r) => { setStep(2); setNote(r.devNote || ''); setMsg({ text: r.message, ok: true }); })
      .catch((x) => setMsg({ text: x.message, ok: false }))
      .finally(() => setBusy(false));
  };

  // Step 2: code + new password
  const reset = (e) => {
    e.preventDefault();
    const v = {};
    if (!/^\d{6}$/.test(f.code.trim())) v.code = 'Enter the 6-digit code from the email.';
    if (!passwordOk(f.password)) v.password = 'Password does not meet all the rules below.';
    if (f.again !== f.password) v.again = 'Passwords do not match.';
    setFe(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    api('/auth/reset-password', { userId: f.userId.trim(), code: f.code.trim(), password: f.password })
      .then((r) => { setStep(3); setMsg({ text: r.message, ok: true }); })
      .catch((x) => {
        const field = fieldFromServer(x.message, ['code', 'password']);
        if (field) setFe(field);
        setMsg({ text: field ? '' : x.message, ok: false });
      })
      .finally(() => setBusy(false));
  };

  const field = (label, key, type = 'text', extra = {}) => (
    <>
      <label>{label}</label>
      <input type={type} value={f[key]} onChange={change(key)} className={fe[key] ? 'bad' : ''} {...extra} />
      {fe[key] && <small className="ferr">{fe[key]}</small>}
    </>
  );

  return (
    <div className={'login ' + (teacher ? 'tutor' : 'student')}>
      <div className={'hero' + (teacher ? ' teacherlogin' : '')}>
        <div className="herologo">
          <img src="/logo.jpg" alt="" />
          <span>CheckIn</span>
        </div>
        <div>
          <span className="hero-eyebrow">{teacher ? 'TUTOR PORTAL' : 'STUDENT PORTAL'}</span>
          <h1>Reset your <span>password.</span></h1>
          <p>We'll email a 6-digit code to the college email on your account. The code works once and expires in 15 minutes.</p>
          <div className="hero-bar" />
        </div>
        <small>College of Science and Technology</small>
      </div>

      <form className="lcard" onSubmit={step === 1 ? sendCode : reset}>
        <a className="alt" onClick={() => nav(back)} style={{ display: 'block', textAlign: 'left' }}>← Back to login</a>
        <img className="cardlogo" src="/logo.jpg" alt="CST logo" />
        <h2>Forgot password</h2>
        {step < 3 && <p className="steps">Step {step} of 2 · {step === 1 ? 'Get a code' : 'Set a new password'}</p>}

        {step === 1 && (
          <>
            {field(teacher ? 'Staff ID' : 'Student ID', 'userId', 'text', { placeholder: teacher ? 'e.g. CST-0142' : 'e.g. 02250368', autoComplete: 'username' })}
            {msg.text && <p className={msg.ok ? 'okmsg' : 'err'}>{msg.text}</p>}
            <button className={'btn ' + (teacher ? '' : 'purple')} style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </>
        )}

        {step === 2 && (
          <>
            {msg.text && <p className={msg.ok ? 'okmsg' : 'err'}>{msg.text}</p>}
            {note && <p className="steps">{note}</p>}
            {field('6-digit code', 'code', 'text', { inputMode: 'numeric', maxLength: 6, placeholder: '123456', autoComplete: 'one-time-code' })}
            {field('New password', 'password', show ? 'text' : 'password', { autoComplete: 'new-password' })}
            <ul className="pwrules">
              {passwordChecks(f.password).map(([label, ok]) => (
                <li key={label} className={ok ? 'ok' : ''}>{ok ? '✓' : '○'} {label}</li>
              ))}
            </ul>
            {field('Confirm new password', 'again', show ? 'text' : 'password', { autoComplete: 'new-password' })}
            <label className="showpw">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
            </label>
            <button className={'btn ' + (teacher ? '' : 'purple')} style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Saving…' : 'Reset password'}
            </button>
            <p className="alt">Didn't get it? <a onClick={sendCode}>Send a new code</a></p>
          </>
        )}

        {step === 3 && (
          <>
            <p className="okmsg">✓ {msg.text}</p>
            <button type="button" className={'btn ' + (teacher ? '' : 'purple')} style={{ width: '100%' }} onClick={() => nav(back)}>
              Go to login
            </button>
          </>
        )}
      </form>
    </div>
  );
}
