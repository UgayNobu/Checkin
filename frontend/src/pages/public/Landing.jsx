import { useNavigate } from 'react-router-dom';
import './public.css';
import front from '../../../Photo/front.jpg';
import logo from '../../../Photo/logo.jpg';
const Logo = () => <img className="logo" src={logo} alt="CST logo" />;

export default function Landing() {
  const nav = useNavigate();
  return (
    <div className="land">
      <div className="lhead">
        <Logo />
        <div><b>CheckIn</b><small>College of Science & Technology</small></div>
      </div>

      <div className="lbody">
        <div className="ltxt">
          <span className="eyebrow">🎓 ROYAL UNIVERSITY OF BHUTAN</span>
          <h1>Fair, fast, and honest attendance.</h1>
          <p>
            Every check-in counts. Our cryptographically secure, verified-presence system
            guarantees high trust standards for students, tutors, and university administrators alike.
          </p>
          <div className="photo">
            <img
              src={front}
              alt="CST campus event"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <span className="loc">📍 CST Campus Network, Phuntsholing</span>
          </div>
        </div>

        <div className="pick">
          <div className="logobox"><Logo /></div>
          <h2>CheckIn</h2>
          <small>College of Science and Technology</small>
          <div className="cont">CONTINUE AS</div>
          <div className="opt hot" onClick={() => nav('/login')}>
            <div><b>Student</b><small>Check in, view attendance, submit evidence documents</small></div>›
          </div>
          <div className="opt" onClick={() => nav('/login?as=teacher')}>
            <div><b>Teacher</b><small>Manage sessions and rosters</small></div>›
          </div>
        </div>
      </div>
    </div>
  );
}