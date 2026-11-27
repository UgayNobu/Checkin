// Landing page: choose Student or Staff (tutors, management and the ICT admin all sign in as staff).
// Campus photo under moving colour light, a typing headline, a phone that plays a check-in,
// numbers that count up, and a "how it works" strip that rises in as you scroll.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notice } from '../../api';
import { CountUp } from '../../motion';
import { Typing, PhoneDemo, Aurora } from './Fx.jsx';
import './public.css';
// Images live in frontend/photo, which Vite serves at the site root (publicDir in vite.config.js)
const logo = '/logo.jpg';

const STATS = [
  [6, 'character code per class'],
  ['90%', 'attendance rule, tracked live'],
  [4, 'roles: student, tutor, management, admin'],
];
const HOW = [
  ['⚡', 'Tutor opens a code', 'At the start of class the tutor starts attendance from the timetable and a short code appears.'],
  ['📱', 'Students type it in', 'Each student enters the code on their own phone while the code is open.'],
  ['📍', 'Location confirms it', 'CheckIn checks they are in the right building, so every mark is real.'],
  ['📊', 'Records update live', 'Tutors and management see attendance and the 90% rule straight away.'],
];

/** Adds data-in to children of the ref when they scroll into view */
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const els = ref.current ? [...ref.current.querySelectorAll('[data-rv]')] : [];
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.setAttribute('data-in', '')); return undefined; }
    const io = new IntersectionObserver((list) => list.forEach((e) => {
      if (e.isIntersecting) { e.target.setAttribute('data-in', ''); io.unobserve(e.target); }
    }), { threshold: 0.2 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return ref;
}

export default function Landing() {
  const nav = useNavigate();
  // e.g. "Your account has been deactivated by the admin…" after being logged out
  const [msg] = useState(() => notice.take());
  const how = useReveal();
  // the photo drifts a little with the mouse (laptops only)
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const move = (e) => {
    if (window.matchMedia('(hover: none), (prefers-reduced-motion: reduce)').matches) return;
    setTilt({ x: (e.clientX / innerWidth - 0.5) * 2, y: (e.clientY / innerHeight - 0.5) * 2 });
  };

  return (
    <div className="lx-page">
      <div className="lx" onMouseMove={move} style={{ '--tx': tilt.x, '--ty': tilt.y }}>
        <div className="lx-photo" aria-hidden="true" />
        <Aurora />
        <header className="lx-head">
          <img src={logo} alt="CST logo" />
          <div>
            <b>CheckIn</b>
            <small>College of Science &amp; Technology</small>
          </div>
          <span className="lx-chip"><i /> Live attendance</span>
        </header>

        <main className="lx-body">
          <div className="lx-text">
            <span className="lx-eyebrow">ROYAL UNIVERSITY OF BHUTAN</span>
            <h1>
              <span className="ln">Attendance that's</span>{' '}
              <span className="ln"><Typing words={['honest.', 'fast.', 'fair.', 'on your phone.']} /></span>
            </h1>
            <p>
              Tutors open a short check-in code at the start of class, and students check in from their own
              phone. CheckIn confirms they are in the right building, so every mark is real.
            </p>
            <div className="lx-stats">
              {STATS.map(([v, l]) => (
                <div key={l}><b><CountUp value={v} ms={1400} /></b><small>{l}</small></div>
              ))}
            </div>
            <div className="lx-loc">📍 College of Science and Technology, Phuentsholing</div>
          </div>

          <PhoneDemo />

          <div className="lx-card">
            <img className="lx-logo" src={logo} alt="" />
            <h2>CheckIn</h2>
            <small>College of Science and Technology</small>
            <div className="lx-line" />
            {msg && <p className="lx-notice" role="alert">{msg}</p>}
            <div className="lx-cont">CONTINUE AS</div>
            <button type="button" className="lx-opt lx-primary" onClick={() => nav('/login')}>
              <span className="lx-ico" aria-hidden="true">🎓</span>
              <span>
                <b>Student</b>
                <small>Check in, view attendance, submit evidence documents</small>
              </span>
              <i aria-hidden="true">›</i>
            </button>
            <button type="button" className="lx-opt" onClick={() => nav('/login?as=teacher')}>
              <span className="lx-ico" aria-hidden="true">🧑‍🏫</span>
              <span>
                <b>Staff</b>
                <small>Tutors, management and ICT admin: attendance, records and approvals</small>
              </span>
              <i aria-hidden="true">›</i>
            </button>
          </div>
        </main>
        <a className="lx-scroll" href="#how" aria-label="How it works"><span /></a>
      </div>

      <section className="lx-how" id="how" ref={how}>
        <h2 data-rv>How CheckIn works</h2>
        <p className="lx-how-sub" data-rv>From the code on the board to the record in the report, in under a minute.</p>
        <ol>
          {HOW.map(([icon, title, text], i) => (
            <li key={title} data-rv style={{ '--i': i }}>
              <span className="lx-step">{icon}<em>{i + 1}</em></span>
              <b>{title}</b>
              <small>{text}</small>
            </li>
          ))}
        </ol>
        <div className="lx-how-cta" data-rv>
          <button type="button" className="lx-opt lx-primary" onClick={() => nav('/login')}><b>I'm a student</b><i aria-hidden="true">›</i></button>
          <button type="button" className="lx-opt dark" onClick={() => nav('/login?as=teacher')}><b>I'm staff</b><i aria-hidden="true">›</i></button>
        </div>
        <small className="lx-copy">© {new Date().getFullYear()} CheckIn · College of Science and Technology, RUB</small>
      </section>
    </div>
  );
}
