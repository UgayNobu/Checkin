import { useState } from 'react'; // CHANGED: useEffect no longer needed
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { validateRegister, passwordChecks, fieldFromServer, PASSWORD_HINT } from '../../validation';
import './public.css';

import { PROG, DEPT } from '../shared/collegeLists';

export default function Register() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const tutor = params.get('as') === 'teacher';
  const back = '/login' + (tutor ? '?as=teacher' : '');

  const [f, setF] = useState({
    name: '',
    userId: '',
    email: '',
    pick: '',
    tprog: '', // CHANGED: tutor's programme
    password: '',
    again: '',
  });
  const [msg, setMsg] = useState({ text: '', ok: false });
  const [touched, setTouched] = useState({}); // show a field's error once the user has left it
  const [serverErr, setServerErr] = useState({});
  const [show, setShow] = useState(false);    // show / hide password
  const [busy, setBusy] = useState(false);
  const lists = { prog: PROG, dept: DEPT }; // CHANGED: use the lists above directly

  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setServerErr({ ...serverErr, [k]: '' }); };
  const leave = (k) => () => setTouched({ ...touched, [k]: true });
  const errors = validateRegister(f, tutor);
  const errOf = (k) => (touched[k] && errors[k]) || serverErr[k] || '';

  // Same rule the backend checks, shown as a checklist so people know what's needed.
  const rules = passwordChecks(f.password);

  const go = (e) => {
    e.preventDefault();
    setMsg({ text: '', ok: false });
    // Show every problem at once when they press the button
    setTouched({ name: true, userId: true, email: true, pick: true, password: true, again: true });
    if (Object.keys(errors).length) return setMsg({ text: 'Please fix the highlighted fields.', ok: false });

    setBusy(true);
    api('/auth/register', {
      role: tutor ? 'teacher' : 'student',
      userId: f.userId.trim().toUpperCase(),
      name: f.name.trim(),
      email: f.email.trim(),
      [tutor ? 'department' : 'programme']: f.pick,
      ...(tutor ? { programme: f.tprog } : {}), // CHANGED: send tutor's programme
      password: f.password,
    })
      .then((r) => {
        setMsg({ text: r.message, ok: true });
        setTimeout(() => nav(back), 1800);
      })
      .catch((x) => {
        // e.g. "userId: must be ..." goes under the right box; anything else shows below the form
        const field = fieldFromServer(x.message, ['name', 'userId', 'email', 'password']);
        if (field) setServerErr(field);
        setMsg({ text: field ? 'Please fix the highlighted fields.' : x.message, ok: false });
      })
      .finally(() => setBusy(false));
  };

  const inp = (label, key, type = 'text', placeholder) => (
    <>
      <label>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={f[key]}
        onChange={set(key)}
        onBlur={leave(key)}
        className={errOf(key) ? 'bad' : ''}
        autoComplete={key === 'password' || key === 'again' ? 'new-password' : undefined}
      />
      {errOf(key) && <small className="ferr">{errOf(key)}</small>}
    </>
  );

  // Tutors no longer sign up or wait for approval: the admin creates their account.
  if (tutor) {
    return (
      <div className="login">
        <div className="hero teacherhero">
          <div className="herologo">
            <img src="/logo.jpg" alt="" />
            <span>CheckIn</span>
          </div>
          <div>
            <h1>Tutor accounts are set up by the admin</h1>
            <p>There is no sign-up or approval step for tutors. The admin creates your account and assigns your modules.</p>
          </div>
          <small>College of Science and Technology · Royal University of Bhutan</small>
        </div>
        <div className="lcard">
          <a className="alt" onClick={() => nav(back)} style={{ display: 'block', textAlign: 'left', cursor: 'pointer' }}>
            ← Back to login
          </a>
          <img className="cardlogo" src="/logo.jpg" alt="CST logo" />
          <h2>New tutor?</h2>
          <ol className="steps-list">
            <li>The admin creates your account with your staff ID and college email.</li>
            <li>Your staff ID and a default password are emailed to you.</li>
            <li>Log in and change the default password.</li>
            <li>Your modules appear once the admin assigns them.</li>
          </ol>
          <button type="button" className="btn" style={{ width: '100%' }} onClick={() => nav(back)}>
            Go to tutor login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login">
      {/* Left side */}
            <div className={'hero ' + (tutor ? 'teacherhero' : 'studenthero')}>
        <div className="herologo">
          <img src="/logo.jpg" alt="" />
          <span>CheckIn</span>
        </div>
        <div>
          <h1>
            {tutor
              ? 'Join the academic verification network'
              : 'Your digital gateway to campus life'}
          </h1>
          <p>
            {tutor
              ? 'Request a tutor account. An admin will approve it before you can sign in.'
              : 'Track attendance, register for core modules, and easily manage absence requests from one centralized student dashboard.'}
          </p>
        </div>
        <small>College of Science and Technology · Royal University of Bhutan</small>
      </div>

      {/* Form card */}
      <form className="lcard" style={{ width: 360 }} onSubmit={go}>
        <a
          className="alt"
          onClick={() => nav(back)}
          style={{ display: 'block', textAlign: 'left' }}
        >
          ← Back to login
        </a>

        <img className="cardlogo" src="/logo.jpg" alt="CST logo" />
        <h2>{tutor ? 'Tutor Sign in' : 'Student sign up'}</h2>

        {inp('Full name', 'name', 'text', 'e.g. Karma Wangmo')}
        {inp(tutor ? 'Staff ID' : 'Student ID', 'userId', 'text', tutor ? 'CST-0142' : '02250368')}
        {inp('College email', 'email', 'email', tutor ? 'name.cst@rub.edu.bt' : '02250368.cst@rub.edu.bt')}

        <label>{tutor ? 'Department' : 'Programme'}</label>
        <select value={f.pick} onChange={set('pick')} onBlur={leave('pick')} className={errOf('pick') ? 'bad' : ''}>
          <option value="">Select</option>
          {(tutor ? lists.dept : lists.prog).map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        {errOf('pick') && <small className="ferr">{errOf('pick')}</small>}
        {/* CHANGED: extra Programme dropdown for tutors */}
        {tutor && (
          <>
            <label>Programme</label>
            <select value={f.tprog} onChange={set('tprog')}>
              <option value="">Select</option>
              {lists.prog.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </>
        )}

        {inp('Password', 'password', show ? 'text' : 'password')}
        <ul className="pwrules" title={PASSWORD_HINT}>
          {rules.map(([label, ok]) => (
            <li key={label} className={ok ? 'ok' : ''}>{ok ? '✓' : '○'} {label}</li>
          ))}
        </ul>
        {inp('Confirm password', 'again', show ? 'text' : 'password')}
        <label className="showpw">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
        </label>

        {msg.text && <p className={msg.ok ? 'okmsg' : 'err'}>{msg.text}</p>}

        <button
          className={'btn ' + (tutor ? '' : 'purple')}
          style={{ width: '100%' }}
          disabled={busy}
        >
          {busy ? 'Please wait…' : tutor ? 'Submit request' : 'Create account'}
        </button>

        <p className="alt">
          Already have an account? <a onClick={() => nav(back)}>Log in</a>
        </p>
      </form>
    </div>
  );
}