import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import './records.css';

/* ---------- Helpers ---------- */
const AXIS = [100, 80, 60, 40, 20, 0];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const STATUS = {
  present: 'Present',
  absent: 'Absent',
  flagged: 'Flagged',
};

const pct = (v) => Math.round(Number(v) || 0);
const shortDate = (d) => {
  const x = new Date(d);
  return `${MONTHS[x.getMonth()]} ${x.getDate()}`;
};
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// pill = true → badge (theory), false → plain text (practical)
// reason = why it was flagged (low GPS accuracy, location API failed, offline check-in)
function StatusCell({ value, pill, reason }) {
  if (!value) return <span className="mut">–</span>;
  const label = STATUS[value] || value;
  return (
    <span
      className={(pill ? 'pill ' : 'st ') + value}
      title={value === 'flagged' ? reason || 'Needs review' : undefined}
    >
      {label}
      {value === 'flagged' && ' ⚑'}
    </span>
  );
}

function Legend() {
  return (
    <div className="legend">
      <span className="st present">Present</span>
      <span className="st absent">Absent</span>
      <span className="st flagged">Flagged ⚑</span>
      <small>
        Flagged = check-in needs review (weak GPS accuracy, location error, or poor internet).
        Hover a flag to see why.
      </small>
    </div>
  );
}

/* ---------- CSV downloads ---------- */
function saveCsv(text, file) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  link.download = file;
  link.click();
}

function downloadModuleCsv(rows) {
  const header = 'Student ID,Name,Practical %,Theory %,Total %,Flagged\n';
  const body = rows
    .map((x) =>
      [x.userId, x.name, pct(x.practical), pct(x.theory), pct(x.total), x.flagged || 0]
        .map(esc)
        .join(',')
    )
    .join('\n');
  saveCsv(header + body, 'attendance.csv');
}

function downloadStudentCsv(data) {
  const header = 'Date,Practical,Theory,Flag reason\n';
  const body = (data.rows || [])
    .map((x) =>
      [
        shortDate(x.date),
        STATUS[x.practical] || '-',
        STATUS[x.theory] || '-',
        x.practicalReason || x.theoryReason || '',
      ]
        .map(esc)
        .join(',')
    )
    .join('\n');
  saveCsv(header + body, `${data.student.userId}-attendance.csv`);
}

/* ---------- Bar graph: attendance by student ---------- */
function AttendanceGraph({ rows }) {
  if (rows.length === 0) return null;
  return (
    <div className="card graph">
      <h4>Attendance by Student</h4>
      <div className="gchart">
        <div className="gaxis">
          {AXIS.map((n) => <span key={n}>{n}</span>)}
        </div>
        <div className="gmain">
          <div className="gplot">
            {rows.map((x) => {
              const t = pct(x.total);
              return (
                <div className="gcol" key={x.id}>
                  <span>{t}%</span>
                  <div
                    className={'gbar' + (t < 80 ? ' low' : '') + (t === 0 ? ' zero' : '')}
                    style={{ height: Math.max(t * 1.6, 3) }}
                    title={`${x.name}: ${t}%`}
                  />
                </div>
              );
            })}
          </div>
          <div className="glabels">
            {rows.map((x) => (
              <span key={x.id}>{(x.name || '').split(' ')[0]}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Page 1: students of one module ---------- */
export function RecordStudents() {
  const { id } = useParams();
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/teacher/records/' + id)
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch(() => setErr('Could not load attendance records.'))
      .finally(() => setLoaded(true));
  }, [id]);

  if (!loaded) return null;

  return (
    <div className="recs">
      <div className="rowb">
        <button className="back" onClick={() => nav('/records')}>&lt;back</button>
        <button className="dl" onClick={() => downloadModuleCsv(rows)} disabled={rows.length === 0}>
          Download
        </button>
      </div>

      {err && <p className="err">{err}</p>}
      <AttendanceGraph rows={rows} />

      <div className="card tbl">
        <table>
          <thead>
            <tr>
              <th>Student ID</th>
              <th>Name</th>
              <th>practical</th>
              <th>theory</th>
              <th>total</th>
              <th>flagged</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty">No students enrolled in this module yet.</td>
              </tr>
            ) : (
              rows.map((x) => (
                <tr key={x.id}>
                  <td>{x.userId}</td>
                  <td>{x.name}</td>
                  <td>
                    <span className={'st ' + (pct(x.practical) < 80 ? 'absent' : 'present')}>
                      {pct(x.practical)}%
                    </span>
                  </td>
                  <td>
                    <span className={'pill ' + (pct(x.theory) < 80 ? 'absent' : 'present')}>
                      {pct(x.theory)}%
                    </span>
                  </td>
                  <td className={'total' + (pct(x.total) < 80 ? ' low' : '')}>{pct(x.total)}%</td>
                  <td>
                    {x.flagged > 0 ? (
                      <span className="pill flagged">{x.flagged} ⚑</span>
                    ) : (
                      <span className="mut">–</span>
                    )}
                  </td>
                  <td>
                    <button className="view" onClick={() => nav(`/records/${id}/${x.id}`)}>view</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Page 2: one student, date by date ---------- */
export function RecordStudent() {
  const { id, sid } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api(`/teacher/records/${id}/${sid}`)
      .then(setData)
      .catch(() => setErr('Could not load this student.'));
  }, [id, sid]);

  if (err) {
    return (
      <div className="recs">
        <button className="back" onClick={() => nav('/records/' + id)}>&lt;back</button>
        <p className="err">{err}</p>
      </div>
    );
  }
  if (!data) return null;

  const rows = data.rows || [];

  return (
    <div className="recs">
      <div className="rowb">
        <button className="back" onClick={() => nav('/records/' + id)}>&lt;back</button>
        <button className="dl" onClick={() => downloadStudentCsv(data)} disabled={rows.length === 0}>
          Download
        </button>
      </div>

      <p className="who">
        {data.student.name}
        <br />
        {data.student.userId}
      </p>

      <Legend />

      <div className="card tbl">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>practical</th>
              <th>theory</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="empty">No classes recorded yet.</td>
              </tr>
            ) : (
              rows.map((x) => (
                <tr key={x.date}>
                  <td>{shortDate(x.date)}</td>
                  <td><StatusCell value={x.practical} reason={x.practicalReason} /></td>
                  <td><StatusCell value={x.theory} reason={x.theoryReason} pill /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Page 0: teacher's modules ---------- */
export function RecordModules() {
  const nav = useNavigate();
  const [mods, setMods] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/teacher/modules')
      .then((r) => setMods(Array.isArray(r) ? r : []))
      .catch(() => setErr('Could not load your modules.'))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  return (
    <div className="recs">
      {err && <p className="err">{err}</p>}

      {mods.length === 0 ? (
        <div className="card nomods">
          <b>No modules assigned yet</b>
          <small>Modules appear here once an admin assigns them to you.</small>
        </div>
      ) : (
        <div className="modgrid">
          {mods.map((m) => (
            <button className="modcard" key={m.id} onClick={() => nav('/records/' + m.id)}>
              <b>{m.code}</b>
              <span>{m.name}</span>
              <small>View attendance →</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}