// Landing page: choose Student or Tutor.
// Full-screen campus photo with a dark overlay, heading on the left, frosted card on the right.
import { useNavigate } from 'react-router-dom';
import './public.css';
// Images live in frontend/photo, which Vite serves at the site root (publicDir in vite.config.js)
const logo = '/logo.jpg';

export default function Landing() {
  const nav = useNavigate();
  return (
    <div className="lx">
      <header className="lx-head">
        <img src={logo} alt="CST logo" />
        <div>
          <b>CheckIn</b>
          <small>College of Science &amp; Technology</small>
        </div>
      </header>

      <main className="lx-body">
        <div className="lx-text">
          <span className="lx-eyebrow">ROYAL UNIVERSITY OF BHUTAN</span>
          <h1>
            Fair, fast and <span>honest</span> attendance.
          </h1>
          <p>
            Tutors open a short check-in code at the start of class, and students check in from their own
            phone. CheckIn confirms they are in the right building, so every mark is real.
          </p>
          <div className="lx-bar" />
          <div className="lx-loc">College of Science and Technology, Phuentsholing</div>
        </div>

        <div className="lx-card">
          <img className="lx-logo" src={logo} alt="" />
          <h2>CheckIn</h2>
          <small>College of Science and Technology</small>
          <div className="lx-line" />
          <div className="lx-cont">CONTINUE AS</div>
          <button type="button" className="lx-opt lx-primary" onClick={() => nav('/login')}>
            <span>
              <b>Student</b>
              <small>Check in, view attendance, submit evidence documents</small>
            </span>
            <i aria-hidden="true">›</i>
          </button>
          <button type="button" className="lx-opt" onClick={() => nav('/login?as=teacher')}>
            <span>
              <b>Tutor</b>
              <small>Start attendance, manage classes and records</small>
            </span>
            <i aria-hidden="true">›</i>
          </button>
        </div>
      </main>
    </div>
  );
}
