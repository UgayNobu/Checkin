import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import './public.css';

const PROG = [
  'BE Information Technology',
  'BE Software Engineering',
  'BE Civil Engineering',
  'BE Electrical Engineering',
];

const DEPT = [
  'Dept. of Information Technology',
  'Dept. of Software Engineering',
  'Dept. of Civil Engineering',
  'Dept. of Electrical Engineering',
];

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
    password: '',
    again: '',
  });
  const [msg, setMsg] = useState('');

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const go = (e) => {
    e.preventDefault();
    if (f.password !== f.again) return setMsg('Passwords do not match');

    api('/auth/register', {
      role: tutor ? 'teacher' : 'student',
      userId: f.userId,
      name: f.name,
      email: f.email,
      [tutor ? 'department' : 'programme']: f.pick,
      password: f.password,
    })
      .then((r) => {
        setMsg(r.message);
        setTimeout(() => nav(back), 1800);
      })
      .catch((x) => setMsg(x.message));
  };

  const inp = (label, key, type = 'text', placeholder) => (
    <>
      <label>{label}</label>
      <input type={type} placeholder={placeholder} value={f[key]} onChange={set(key)} />
    </>
  );

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

        {inp('Full name', 'name')}
        {inp(tutor ? 'Staff ID' : 'Student ID', 'userId', 'text', tutor ? 'CST-0142' : '02250368')}
        {inp('College email', 'email', 'email')}

        <label>{tutor ? 'Department' : 'Programme'}</label>
        <select value={f.pick} onChange={set('pick')}>
          <option value="">Select</option>
          {(tutor ? DEPT : PROG).map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>

        {inp('Password', 'password', 'password')}
        {inp('Confirm password', 'again', 'password')}

        <p className="err">{msg}</p>

        <button
          className={'btn ' + (tutor ? '' : 'purple')}
          style={{ width: '100%', borderRadius: 20 }}
        >
          {tutor ? 'Submit request' : 'Create account'}
        </button>

        <p className="alt">
          Already have an account? <a onClick={() => nav(back)}>Log in</a>
        </p>
      </form>
    </div>
  );
}