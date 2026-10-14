import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import '../teacher/staff.css';
import '../student/attendance.css';
import './History.css';

const E = encodeURIComponent;

const Back = ({ label = '← Back' }) => {
  const nav = useNavigate();
  return <button className="back-dash" onClick={() => nav(-1)}>{label}</button>;
};

/* =========================================================
   HISTORY (attendance records list)
   ========================================================= */
export function History() {
  const nav = useNavigate();
  const [f, setF] = useState({ q: '', year: '', semester: '', department: '' });
  const [rows, setRows] = useState([]);
  const [p, setP] = useState([]);

  useEffect(() => { api('/admin/programs').then(setP).catch(console.error); }, []);
  useEffect(() => {
    api('/management/history?' + new URLSearchParams(Object.entries(f).filter(([, v]) => v)))
      .then(setRows)
      .catch(console.error);
  }, [f]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="mg">
      <h2 className="ttl" style={{ fontWeight: 400 }}>Attendance records - all students</h2>
      <div className="hist">
        <input
          placeholder="Student ID / Name"
          value={f.q}
          onChange={set('q')}
          style={{ borderRadius: 20, background: '#ece6f1', border: 0, width: 230 }}
        />
        <select value={f.year} onChange={set('year')}>
          <option value="">Year</option>
          {['First', 'Second', 'Third', 'Fourth'].map((y, i) => (
            <option key={y} value={i + 1}>{y} Year</option>
          ))}
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
            <tr>
              <th>Name</th><th>Module</th><th>Teacher</th><th>Attendance %</th><th>Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sid + r.mid}>
                <td>{r.name}</td>
                <td>{r.module}</td>
                <td>{r.teacher}</td>
                <td>
                  <span className={'pill ' + (r.pct >= 90 ? 'b' : 'o')}>{r.pct}%</span>
                </td>
                <td>
                  <a
                    className="view"
                    style={{ color: 'var(--blue)', cursor: 'pointer' }}
                    onClick={() => nav(`/history/${r.sid}/${r.mid}`)}
                  >
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
   HISTORY CALENDAR (clickable dates)
   ========================================================= */
export function HistoryCalendar() {
  const { sid, mid } = useParams();
  const [mo, setMo] = useState(new Date());
  const [days, setDays] = useState({});
  const [selected, setSelected] = useState(null);       // clicked date info
  const [detail, setDetail] = useState(null);           // fetched detail
  const [detailLoading, setDetailLoading] = useState(false);

  const y = mo.getFullYear(), m = mo.getMonth();
  const key = `${y}-${String(m + 1).padStart(2, '0')}`;

  // Load month overview (status per day)
  useEffect(() => {
    api(`/management/calendar?student=${sid}&module=${mid}&month=${key}`)
      .then(setDays)
      .catch(console.error);
    // Clear selection when changing month
    setSelected(null);
    setDetail(null);
  }, [key, sid, mid]);

  // When a date is clicked, fetch that day's attendance detail
  const handleDateClick = (d) => {
    // Only allow clicks on days in the current month
    if (d.getMonth() !== m) return;

    const dayNum = d.getDate();
    const dateKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

    // If clicking the same date, toggle off
    if (selected && selected.date === dateKey) {
      setSelected(null);
      setDetail(null);
      return;
    }

    setSelected({ date: dateKey, day: dayNum, status: days[dayNum] || null });
    setDetailLoading(true);

    // Fetch detail for that specific day
    api(`/management/calendar/detail?student=${sid}&module=${mid}&date=${dateKey}`)
      .then((res) => {
        setDetail(res);
        setDetailLoading(false);
      })
      .catch(() => {
        // Fallback: build detail from status we already have
        setDetail({
          date: dateKey,
          status: days[dayNum] || null,
          rows: days[dayNum] ? [{ status: days[dayNum], date: dateKey }] : []
        });
        setDetailLoading(false);
      });
  };

  const lead = new Date(y, m, 1).getDay();
  const weeks = Math.ceil((lead + new Date(y, m + 1, 0).getDate()) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => new Date(y, m, 1 - lead + i));

  return (
    <div className="mg">
      <Back label="← Back" />
      <h2 className="ttl" style={{ fontWeight: 400 }}>Attendance records - all students</h2>

      <div className="calbox">
        <div className="calhead">
          <button className="nav" onClick={() => setMo(new Date(y, m - 1, 1))}>‹</button>
          <b>{mo.toLocaleString('en', { month: 'long', year: 'numeric' })}</b>
          <button className="nav" onClick={() => setMo(new Date(y, m + 1, 1))}>›</button>
        </div>

        <div className="grid">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => <b key={d}>{d}</b>)}
          {cells.map((c, i) => {
            const isCurrentMonth = c.getMonth() === m;
            const dayNum = c.getDate();
            const status = isCurrentMonth ? days[dayNum] : null;
            const dateKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const isSelected = selected && selected.date === dateKey;

            return (
              <div
                key={i}
                className={
                  'day ' +
                  (isCurrentMonth ? status || '' : 'outside') +
                  (isSelected ? ' selected' : '') +
                  (isCurrentMonth ? ' clickable' : '')
                }
                onClick={() => handleDateClick(c)}
              >
                {dayNum}
              </div>
            );
          })}
        </div>

        <div className="legend">
          <span><i className="g" />Present</span>
          <span><i className="r" />Absent</span>
          <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 11 }}>
            Click any date to see details
          </span>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="cal-detail">
          <div className="cal-detail-head">
            <div>
              <b>
                {new Date(selected.date + 'T00:00:00').toLocaleDateString('en-GB', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                })}
              </b>
              <div className="cal-detail-sub">
                {selected.status === 'present' && <span className="chip g">Present</span>}
                {selected.status === 'absent' && <span className="chip r">Absent</span>}
                {!selected.status && <span className="chip" style={{ background: '#f1f5f9', color: '#64748b' }}>No class held</span>}
              </div>
            </div>
            <button className="cal-close" onClick={() => { setSelected(null); setDetail(null); }}>×</button>
          </div>

          {detailLoading ? (
            <p style={{ color: '#64748b', fontSize: 13, padding: '12px 0' }}>Loading details…</p>
          ) : detail && detail.rows && detail.rows.length > 0 ? (
            <div className="tbl" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Time</th>
                    <th>Flag Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.rows.map((r, i) => (
                    <tr key={i}>
                      <td>
                        <span className={
                          'pill ' +
                          (r.status === 'present' ? 'b' : r.status === 'flagged' ? 'o' : 'red')
                        }>
                          {r.status === 'present' ? 'Present' :
                           r.status === 'flagged' ? 'Flagged' :
                           r.status === 'absent' ? 'Absent' : r.status}
                        </span>
                      </td>
                      <td>{r.time || '—'}</td>
                      <td>{r.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: '#64748b', fontSize: 13, padding: '12px 0' }}>
              {selected.status
                ? `Student was ${selected.status} on this day.`
                : 'No class was held on this day.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}