// Admin: semesters (academic sessions).
// Add next semester's dates, then "Start" it when it begins. Starting a semester
// makes it current: tutors are assigned again and students enrol again, while
// every past class, attendance mark and report stays and can still be viewed.
import { useEffect, useState } from 'react';
import { api } from '../../api';
import './semesters.css';

const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const today = () => new Date().toISOString().slice(0, 10);

// Past = its end date has gone by. A semester whose dates have begun but that
// hasn't been started yet is "Not started", not "Past".
function status(x) {
  if (x.isCurrent) return ['Current', 'cur'];
  if (x.endDate < today()) return ['Past', 'past'];
  return x.startDate > today() ? ['Upcoming', 'up'] : ['Not started', 'up'];
}

export default function Semesters() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [f, setF] = useState({ term: 'SS', year: String(new Date().getFullYear() + 1), startDate: '', endDate: '', name: '' });
  const [fe, setFe] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // semester being started
  const [promote, setPromote] = useState(false);

  const load = () => api('/admin/academic-sessions').then(setList).catch((e) => { setErr(e.message); setList([]); });
  useEffect(() => { load(); }, []);

  const code = `${f.term}${f.year}`;
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setFe(''); };

  const add = (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(f.year)) return setFe('Enter the year, e.g. 2027.');
    if (!f.startDate || !f.endDate) return setFe('Choose the start and end dates.');
    if (f.endDate <= f.startDate) return setFe('The end date must be after the start date.');
    setBusy(true);
    api('/admin/academic-sessions', { code, startDate: f.startDate, endDate: f.endDate, name: f.name })
      .then((r) => { setMsg(`Added ${r.name}. Start it when the semester begins.`); setF({ ...f, startDate: '', endDate: '', name: '' }); load(); })
      .catch((x) => setFe(x.message))
      .finally(() => setBusy(false));
  };

  // Moving students up is only suggested for a new (upcoming) Autumn semester
  const ask = (x) => { setConfirm(x); setPromote(x.term === 'autumn' && x.startDate > today()); setMsg(''); };

  const start = () => {
    setBusy(true);
    api(`/admin/academic-sessions/${confirm.code}/make-current`, { promoteYears: promote })
      .then((r) => {
        setMsg(`${confirm.name} is now the current semester.` + (promote ? ` ${r.studentsPromoted} students moved up a year.` : ''));
        setConfirm(null);
        load();
      })
      .catch((x) => setErr(x.message))
      .finally(() => setBusy(false));
  };

  if (!list) return <p className="sem-note">Loading semesters…</p>;
  const current = list.find((x) => x.isCurrent);

  return (
    <div className="semesters">
      <h2 className="sem-title">Semesters</h2>
      <p className="sem-note">
        Tutor assignments and enrolments belong to a semester. When a new semester starts, tutors are assigned
        again and students enrol again. Past attendance stays saved and can be viewed from Attendance Records and History.
      </p>

      {current && (
        <div className="sem-current">
          <small>Current semester</small>
          <b>{current.name} <span>{current.code}</span></b>
          <small>{fmt(current.startDate)} – {fmt(current.endDate)}</small>
          <div className="sem-counts">
            <span><b>{current.tutorAssignments}</b> tutor assignments</span>
            <span><b>{current.enrolments}</b> enrolments</span>
            <span><b>{current.timetableSlots}</b> timetable classes</span>
          </div>
        </div>
      )}

      {err && <p className="err">{err}</p>}
      {msg && <p className="sem-ok">✓ {msg}</p>}

      {confirm && (
        <div className="sem-confirm">
          <b>Start {confirm.name}?</b>
          <ul>
            <li>It becomes the current semester for everyone.</li>
            <li>The admin assigns tutors to modules again, and students enrol again with the tutor's key.</li>
            <li>The timetable shows {confirm.code} classes ({confirm.timetableSlots} loaded).</li>
            <li>{current ? current.name : 'The old semester'} and all its attendance stay saved.</li>
            {confirm.endDate < today() && <li><b>This semester has already ended.</b> Only switch back to it to undo a mistake.</li>}
            {confirm.startDate <= today() && confirm.endDate >= today() && <li><b>This semester's start date has already passed</b>, so it starts straight away.</li>}
          </ul>
          <label className="sem-check">
            <input type="checkbox" checked={promote} onChange={(e) => setPromote(e.target.checked)} />
            <span>Move every student up one year (only at the start of a new academic year, usually Autumn)</span>
          </label>
          <div className="sem-actions">
            <button className="sem-btn" onClick={start} disabled={busy}>{busy ? 'Starting…' : `Start ${confirm.code}`}</button>
            <button className="sem-btn ghost" onClick={() => setConfirm(null)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}

      <h3 className="sem-h">All semesters</h3>
      <div className="sem-tbl">
        <table>
          <thead>
            <tr><th>Semester</th><th>Dates</th><th>Tutors</th><th>Enrolments</th><th>Timetable</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {list.map((x) => {
              const [label, cls] = status(x);
              return (
                <tr key={x.code}>
                  <td><b>{x.name}</b><br /><small>{x.code}</small></td>
                  <td>{fmt(x.startDate)} – {fmt(x.endDate)}</td>
                  <td>{x.tutorAssignments}</td>
                  <td>{x.enrolments}</td>
                  <td>{x.timetableSlots}</td>
                  <td><span className={'sem-pill ' + cls}>{label}</span></td>
                  <td>{!x.isCurrent && <button className="sem-link" onClick={() => ask(x)}>Start</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="sem-h">Add the next semester</h3>
      <form className="sem-form" onSubmit={add}>
        <label>Semester
          <select value={f.term} onChange={set('term')}>
            <option value="AS">Autumn (AS)</option>
            <option value="SS">Spring (SS)</option>
          </select>
        </label>
        <label>Year
          <input value={f.year} onChange={set('year')} inputMode="numeric" maxLength={4} />
        </label>
        <label>Starts
          <input type="date" value={f.startDate} onChange={set('startDate')} />
        </label>
        <label>Ends
          <input type="date" value={f.endDate} onChange={set('endDate')} />
        </label>
        <button className="sem-btn" disabled={busy}>Add {code}</button>
        {fe && <p className="err sem-ferr">{fe}</p>}
      </form>
      <p className="sem-note">
        Load that semester's timetable with its code (academic_session = {code}) before starting it, so the Timetable page has its classes.
      </p>
    </div>
  );
}
