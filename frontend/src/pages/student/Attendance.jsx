import { useEffect, useState } from 'react';
import { api } from '../../api';
import './attendance.css';

export default function Attendance() {
  const [code, setCode] = useState(''), [msg, setMsg] = useState(''), [mo, setMo] = useState(new Date()), [days, setDays] = useState({});
  const y = mo.getFullYear(), m = mo.getMonth(), key = `${y}-${String(m + 1).padStart(2, '0')}`;
  const load = () => api('/attendance/me?month=' + key).then(setDays);
  useEffect(() => { load(); }, [key]);
  const checkIn = () => navigator.geolocation.getCurrentPosition(
    (p) => api('/attendance/checkin', { code, lat: p.coords.latitude, lng: p.coords.longitude }).then((r) => { setMsg(r.message); load(); }).catch((e) => setMsg(e.message)),
    () => setMsg('Allow location access to check in'));
  const lead = new Date(y, m, 1).getDay(), weeks = Math.ceil((lead + new Date(y, m + 1, 0).getDate()) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => new Date(y, m, 1 - lead + i));
  return (
    <div className="att">
      <div className="record"><b>Record Attendance</b><small>Enter the live check-in code shared by your tutor in class</small>
        <div className="entry"><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="A1B2C3" /><button onClick={checkIn}>Check In</button></div>
        {msg && <p className="msg">{msg}</p>}</div>
      <div className="calbox">
        <div className="calhead"><button className="nav" onClick={() => setMo(new Date(y, m - 1, 1))}>‹</button>
          <b>{mo.toLocaleString('en', { month: 'long', year: 'numeric' })}</b><button className="nav" onClick={() => setMo(new Date(y, m + 1, 1))}>›</button></div>
        <div className="grid">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => <b key={d}>{d}</b>)}
          {cells.map((c, i) => <div key={i} className={'day ' + (c.getMonth() === m ? days[c.getDate()] || '' : '')}>{c.getDate()}</div>)}</div>
        <div className="legend"><span><i className="g" />Present</span><span><i className="r" />Absent</span></div></div>
    </div>);
}
