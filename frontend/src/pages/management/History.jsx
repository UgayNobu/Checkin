import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import SemesterPicker, { useSemester } from '../shared/SemesterPicker';
import '../teacher/staff.css';
import '../student/attendance.css';
import './History.css';

const fmt = (d) => new Date(d).toLocaleDateString('en', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

// Calendar colours: present = green, anything else recorded = red (same as the student's own calendar)
const show = (s) => (s === 'present' ? 'present' : s ? 'absent' : '');

const Back = ({ label = '← Back' }) => {
  const nav = useNavigate();
  return (
    <button
      className="back"
      style={{ border: '1px solid #222', borderRadius: 5, padding: '5px 10px', background: '#fff', marginBottom: 14 }}
      onClick={() => nav(-1)}
    >
      {label}
    </button>
  );
};

/* =========================================================
   1. All students: search + filters + attendance %
   ========================================================= */
export function History() {
  const nav = useNavigate();
  const [f, setF] = useState({ q: '', year: '', semester: '', department: '' });
  const [rows, setRows] = useState([]);
  const [p, setP] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const { session, setSession } = useSemester(); // '' = current semester, or e.g. AS2026

  useEffect(() => { api('/admin/programs').then(setP).catch(() => setP([])); }, []);

  useEffect(() => {
    api('/management/history?' + new URLSearchParams(Object.entries({ ...f, session }).filter(([, v]) => v)))
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch(() => setRows([]))
      .finally(() => setLoaded(true));
  }, [f, session]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="mg">
      <h2 className="ttl" style={{ fontWeight: 400 }}>Attendance records - all students</h2>
      <SemesterPicker session={session} setSession={setSession} />

      <div className="hist">
        <input
          placeholder="Student ID / Name"
          value={f.q}
          onChange={set('q')}
          style={{ borderRadius: 20, background: '#dee2e6', border: 0, width: 230 }}
        />
        <select value={f.year} onChange={set('year')}>
          <option value="">Year</option>
          {['First', 'Second', 'Third', 'Fourth'].map((y, i) => <option key={y} value={i + 1}>{y} Year</option>)}
        </select>
        <select value={f.semester} onChange={set('semester')}>
          <option value="">Semester</option>
          <option value="1">Semester 1</option>
          <option value="2">Semester 2</option>
        </select>
        <select value={f.department} onChange={set('department')}>
          <option value="">Department</option>
          {p.map((x) => <option key={x}>{x}</option>)}
        </select>
      </div>

      <div className="tbl">
        <table>
          <thead>
            <tr><th>Name</th><th>Student ID</th><th>Module</th><th>Teacher</th><th>Attendance %</th><th>History</th></tr>
          </thead>
          <tbody>
            {loaded && rows.length === 0 && (
              <tr><td colSpan={6} className="hx-empty">No attendance records match these filters.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.sid + r.mid}>
                <td>{r.name}</td>
                <td>{r.userId || r.sid}</td>
                <td>{r.module}</td>
                <td>{r.teacher || '–'}</td>
                <td>{r.pct == null ? <span className="mut">No classes yet</span> : <span className={'pill ' + (r.pct >= 90 ? 'b' : 'o')}>{r.pct}%</span>}</td>
                <td>
                  <a className="view" style={{ color: 'var(--blue)', cursor: 'pointer' }} onClick={() => nav(`/history/${r.sid}/${r.mid}`)}>
                    View
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =========================================================
   2. One student in one module: summary + calendar + every date
   ========================================================= */
export function HistoryCalendar() {
  const { sid, mid } = useParams();
  const [mo, setMo] = useState(new Date());
  const [days, setDays] = useState({});
  const [info, setInfo] = useState(null); // { student, present, absent, total, pct, history }
  const [jumped, setJumped] = useState(false);

  const y = mo.getFullYear(), m = mo.getMonth(), key = `${y}-${String(m + 1).padStart(2, '0')}`;

  // Student summary + full date-by-date history
  useEffect(() => {
    api(`/management/student/${sid}?module=${mid}`).then(setInfo).catch(() => setInfo(null));
  }, [sid, mid]);

  // Open the calendar on the month of the latest record (once)
  useEffect(() => {
    if (jumped || !info?.history?.length) return;
    const last = new Date(info.history[info.history.length - 1].date);
    setMo(new Date(last.getFullYear(), last.getMonth(), 1));
    setJumped(true);
  }, [info, jumped]);

  // Calendar colours for the month being shown
  useEffect(() => {
    api(`/management/calendar?student=${sid}&module=${mid}&month=${key}`).then(setDays).catch(() => setDays({}));
  }, [key, sid, mid]);

  const lead = new Date(y, m, 1).getDay();
  const weeks = Math.ceil((lead + new Date(y, m + 1, 0).getDate()) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => new Date(y, m, 1 - lead + i));

  const history = [...(info?.history || [])].reverse(); // newest first

  const downloadCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const body = history.map((h) => [fmt(h.date), show(h.status) === 'present' ? 'Present' : 'Absent'].map(esc).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['Date,Status\n' + body], { type: 'text/csv' }));
    link.download = `${info?.student?.userId || sid}-attendance.csv`;
    link.click();
  };

  return (
    <div className="mg">
      <Back label="← Back" />
      <h2 className="ttl" style={{ fontWeight: 400 }}>Attendance history</h2>

      {/* Who + totals */}
      {info && (
        <div className="hx-sum">
          <div className="hx-who">
            <b>{info.student?.name}</b>
            <small>{info.student?.userId}</small>
          </div>
          <div className="hx-stats">
            <div><b>{info.total ?? 0}</b><small>Classes</small></div>
            <div className="g"><b>{info.present ?? 0}</b><small>Present</small></div>
            <div className="r"><b>{info.absent ?? 0}</b><small>Absent</small></div>
            <div className={info.pct == null ? '' : info.pct >= 90 ? 'g' : 'r'}><b>{info.pct == null ? '–' : `${info.pct}%`}</b><small>Attendance</small></div>
          </div>
        </div>
      )}

      {/* Calendar */}
      <div className="calbox">
        <div className="calhead">
          <button className="nav" onClick={() => setMo(new Date(y, m - 1, 1))}>‹</button>
          <b>{mo.toLocaleString('en', { month: 'long', year: 'numeric' })}</b>
          <button className="nav" onClick={() => setMo(new Date(y, m + 1, 1))}>›</button>
        </div>
        <div className="grid">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => <b key={d}>{d}</b>)}
          {cells.map((c, i) => (
            <div key={i} className={'day ' + (c.getMonth() === m ? show(days[c.getDate()]) : '')}>
              {c.getDate()}
            </div>
          ))}
        </div>
        <div className="legend">
          <span><i className="g" />Present</span>
          <span><i className="r" />Absent</span>
        </div>
      </div>

      {/* Every class, newest first */}
      <div className="hx-head">
        <h3>All classes</h3>
        <button className="hx-dl" onClick={downloadCsv} disabled={!history.length}>Download CSV</button>
      </div>
      <div className="tbl">
        <table>
          <thead>
            <tr><th>Date</th><th>Status</th></tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr><td colSpan={2} className="hx-empty">No classes recorded yet.</td></tr>
            )}
            {history.map((h, i) => (
              <tr key={i}>
                <td>{fmt(h.date)}</td>
                <td>
                  <span className={'hx-st ' + show(h.status)}>
                    {show(h.status) === 'present' ? 'Present' : 'Absent'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}