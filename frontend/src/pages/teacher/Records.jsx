import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import SemesterPicker, { useSemester } from '../shared/SemesterPicker';
import { coverOf } from './Modules.jsx';
import './records.css';

/* ---------- Helpers ---------- */
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
const niceDate = (d) =>
  new Date(d).toLocaleDateString('en', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function saveCsv(header, rows, file) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const text = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  link.download = file;
  link.click();
}

/* =========================================================
   Page 0: teacher's modules   (/records)
   ========================================================= */
export function RecordModules() {
  const nav = useNavigate();
  const { session, setSession, qs } = useSemester(); // ?session=AS2026 → an old semester
  const [mods, setMods] = useState([]);
  const [info, setInfo] = useState({}); // moduleId → { classes, hours, last, avg, below, students }
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const term = qs ? '&' + qs.slice(1) : '';
    setInfo({});
    Promise.all([api('/teacher/modules' + qs), api('/sessions/mine?limit=100' + term).catch(() => [])])
      .then(async ([r, ses]) => {
        const list = Array.isArray(r) ? r : [];
        setMods(list);
        const all = Array.isArray(ses) ? ses : [];
        // A tutor has at most a few modules, so one records call per module is fine
        const entries = await Promise.all(list.map(async (m) => {
          const mine = all.filter((s) => s.module?.id === m.id && s.status === 'ended' && !s.optional);
          const rows = await api(`/teacher/records/${m.id}${qs}`).catch(() => []);
          const has = mine.length > 0;
          const pcts = (Array.isArray(rows) ? rows : []).map((x) => x.total);
          return [m.id, {
            classes: mine.length,
            hours: Math.round(mine.reduce((a, s) => a + (s.hours || 0), 0) * 10) / 10,
            last: mine[0]?.date || null,
            avg: has && pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
            below: has ? pcts.filter((p) => p < 90).length : 0,
            students: pcts.length,
          }];
        }));
        setInfo(Object.fromEntries(entries));
      })
      .catch(() => setMods([]))
      .finally(() => setLoaded(true));
  }, [qs]);

  if (!loaded) return null;

  return (
    <div className="recs">
      <SemesterPicker session={session} setSession={setSession} />
      {mods.length === 0 ? (
        <div className="rec-box rec-empty-box">
          <b>No modules assigned yet</b>
          <small>Modules appear here once an admin assigns them to you.</small>
        </div>
      ) : (
        <div className="rmods">
          {mods.map((m) => {
            const i = info[m.id];
            const go = () => nav('/records/' + m.id + qs);
            return (
              <div className="rmod" key={m.id} role="link" tabIndex={0} onClick={go} onKeyDown={(e) => e.key === 'Enter' && go()}>
                <div className="rmod-img" style={{ backgroundImage: coverOf(m) }} aria-hidden="true">
                  <span>{m.code}</span>
                </div>
                <div className="rmod-main">
                  <div className="rmod-head">
                    <div>
                      <small className="rmod-cat">{m.code}{m.section ? ` · Section ${m.section}` : ''}</small>
                      <b className="rmod-name">{m.name}</b>
                    </div>
                    <span className="rmod-link">View attendance →</span>
                  </div>
                  <div className="rmod-stats">
                    <div><small>Students</small><b>{i ? i.students : '…'}</b></div>
                    <div><small>Classes held</small><b>{i ? i.classes : '…'}</b><em>{i && i.hours ? `${i.hours} hours` : ' '}</em></div>
                    <div><small>Last class</small><b className="rmod-date">{i ? (i.last ? new Date(i.last).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '–') : '…'}</b></div>
                    <div className="rmod-avg">
                      <small>Average attendance</small>
                      <b className={i && i.avg == null ? 'none' : i && i.avg < 90 ? 'low' : ''}>{i ? (i.avg == null ? 'No classes yet' : `${i.avg}%`) : '…'}</b>
                      {i && i.avg != null && <span className="rmod-bar"><span style={{ width: `${Math.min(100, i.avg)}%` }} className={i.avg < 90 ? 'low' : ''} /></span>}
                    </div>
                    <div><small>Below 90%</small><b className={i && i.below ? 'low' : ''}>{i ? i.below : '…'}</b><em>{i && i.below ? (i.below === 1 ? 'student' : 'students') : ' '}</em></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   Page 1: every session of one module   (/records/:id)
   ========================================================= */
export function RecordStudents() {
  const { id } = useParams();
  const nav = useNavigate();
  const { qs } = useSemester();
  const [mod, setMod] = useState(null);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState(''); // date search (YYYY-MM-DD)
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const term = qs ? '&' + qs.slice(1) : ''; // this semester's classes only
    Promise.all([api('/teacher/modules' + qs), api('/sessions/mine?limit=100' + term)])
      .then(async ([mods, ses]) => {
        setMod((Array.isArray(mods) ? mods : []).find((m) => m.id === id) || null);
        const mine = (Array.isArray(ses) ? ses : []).filter((s) => s.module?.id === id);
        // Present / absent counts for each session
        const withCounts = await Promise.all(
          mine.map((s) =>
            api(`/sessions/${s._id}/roster`)
              .then((r) => ({ ...s, counts: r.counts }))
              .catch(() => ({ ...s, counts: null }))
          )
        );
        setRows(withCounts);
      })
      .catch(() => setRows([]))
      .finally(() => setLoaded(true));
  }, [id, qs]);

  const shown = q ? rows.filter((r) => isoDay(r.date) === q) : rows;

  const download = () =>
    saveCsv(
      ['Date', 'Type', 'Hours', 'Present', 'Absent', 'Attendance %'],
      shown.map((r) => [
        niceDate(r.date), r.type, r.hours,
        r.counts?.present ?? '', r.counts?.absent ?? '',
        r.counts ? pctOf(r.counts.present, r.counts.enrolled) : '',
      ]),
      `${mod?.code || 'module'}-sessions.csv`
    );

  return (
    <div className="recs">
      <div className="rec-top">
        <button className="rec-back" onClick={() => nav('/records' + qs)}>&lt; back</button>
        <button className="rec-dl" onClick={download} disabled={!shown.length}>Download</button>
      </div>

      <div className="rec-title">
        <h2>{mod ? `${mod.code} – ${mod.name}` : 'Module'}</h2>
        <small>Every class session. Click View to see each student.</small>
      </div>

      <div className="rec-bar">
        <label>Search by date</label>
        <input type="date" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button className="rec-clear" onClick={() => setQ('')}>Clear</button>}
      </div>

      <div className="rec-tbl">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Total hour</th>
              <th>Total present</th>
              <th>Total absent</th>
              <th>Attendance</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loaded && shown.length === 0 && (
              <tr><td colSpan={7} className="rec-empty">{q ? 'No class on that date.' : 'No classes recorded yet.'}</td></tr>
            )}
            {shown.map((r) => {
              const c = r.counts;
              const p = c ? pctOf(c.present, c.enrolled) : null;
              return (
                <tr key={r._id}>
                  <td>
                    {niceDate(r.date)}
                    {r.status === 'ongoing' && <span className="rec-live">Live</span>}
                    {r.extra && <span className="rec-tag">{r.optional ? 'Optional' : 'Extra'}</span>}
                    {r.coveredBy && <span className="rec-tag">Cover</span>}
                  </td>
                  <td className="rec-cap">{r.type}</td>
                  <td>{r.hours} hr</td>
                  <td className="rec-g">{c ? c.present : '–'}</td>
                  <td className="rec-r">
                    {c ? c.absent : '–'}
                    {c?.flagged > 0 && <small className="rec-flagnote"> +{c.flagged} to review</small>}
                  </td>
                  <td><span className={'rec-pct ' + (p !== null && p < 80 ? 'low' : '')}>{p !== null ? `${p}%` : '–'}</span></td>
                  <td><button className="rec-view" onClick={() => nav(`/records/${id}/${r._id}${qs}`)}>View</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =========================================================
   Page 2: one session, every student   (/records/:id/:sid)
   ========================================================= */
export function RecordStudent() {
  const { id, sid } = useParams();
  const nav = useNavigate();
  const { qs } = useSemester();
  const [data, setData] = useState(null); // roster
  const [totals, setTotals] = useState({}); // userId -> total % in the module
  const [hist, setHist] = useState(null); // student whose past semesters are open
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  const load = () => {
    api(`/sessions/${sid}/roster`).then(setData).catch((e) => setErr(e.message));
    api(`/teacher/records/${id}${qs}`)
      .then((l) => {
        const map = {};
        (Array.isArray(l) ? l : []).forEach((x) => { map[x.userId || x.id] = x.total ?? x.pct ?? 0; });
        setTotals(map);
      })
      .catch(() => setTotals({}));
  };
  useEffect(load, [id, sid, qs]);

  // Student was in class but couldn't check in (no internet on that floor, phone problem):
  // the tutor marks them present by hand; it is recorded with the reason and in the audit log
  const [marking, setMarking] = useState(null); // { userId, reason } while choosing the reason
  const mark = (r, reason) =>
    api(`/sessions/${sid}/students/${encodeURIComponent(r.userId)}/mark`, { status: 'present', reason })
      .then(() => { setMarking(null); load(); })
      .catch((e) => setErr(e.message));

  // Teacher decides a flagged check-in: Present (accept) or Absent (reject)
  const decide = (r, accept) =>
    api(`/sessions/${sid}/flagged/${r.attendanceId}/${accept ? 'accept' : 'reject'}`, {})
      .then(load)
      .catch((e) => setErr(e.message));

  if (err && !data) {
    return (
      <div className="recs">
        <button className="rec-back" onClick={() => nav('/records/' + id + qs)}>&lt; back</button>
        <p className="rec-err">{err}</p>
      </div>
    );
  }
  if (!data) return null;

  const rows = (data.rows || []).filter((r) =>
    ((r.userId || '') + ' ' + (r.name || '')).toLowerCase().includes(q.toLowerCase())
  );
  const c = data.counts || {};

  const download = () =>
    saveCsv(
      ['Student ID', 'Name', 'Status', 'Total %'],
      rows.map((r) => [r.userId, r.name, r.status, totals[r.userId] ?? 0]),
      `${data.session?.module?.code || 'session'}-${isoDay(data.session?.date)}.csv`
    );

  return (
    <div className="recs">
      <div className="rec-top">
        <button className="rec-back" onClick={() => nav('/records/' + id + qs)}>&lt; back</button>
        <button className="rec-dl" onClick={download} disabled={!rows.length}>Download</button>
      </div>

      <div className="rec-title">
        <h2>{data.session?.module?.code} – {data.session?.module?.name}</h2>
        <small>
          {niceDate(data.session?.date)} · <span className="rec-cap">{data.session?.type}</span> ·{' '}
          <span className="rec-g">{c.present ?? 0} present</span> ·{' '}
          <span className="rec-r">{c.absent ?? 0} absent</span>
          {c.flagged > 0 && <> · <span className="rec-o">{c.flagged} to review</span></>}
          {data.session?.optional && <> · Optional class: doesn't count toward attendance</>}
        </small>
      </div>

      {err && <p className="rec-err">{err}</p>}

      <div className="rec-bar">
        <label>Search student</label>
        <input placeholder="Student ID or name" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="rec-tbl">
        <table>
          <thead>
            <tr>
              <th>Student ID</th>
              <th>Name</th>
              <th>Status (this class)</th>
              <th>Total attendance</th>
              <th>Past semesters</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="rec-empty">{q ? 'No student matches that search.' : 'No students enrolled.'}</td></tr>
            )}
            {rows.map((r) => {
              const total = totals[r.userId] ?? 0;
              return (
                <tr key={r.userId}>
                  <td>{r.userId}</td>
                  <td>{r.name}</td>
                  <td>
                    {r.status === 'flagged' ? (
                      <div className="rec-decide">
                        <span className="rec-st flagged" title={r.reason || 'Needs review'}>Review ⚑</span>
                        <button className="rec-yes" onClick={() => decide(r, true)}>Present</button>
                        <button className="rec-no" onClick={() => decide(r, false)}>Absent</button>
                      </div>
                    ) : (
                      <span className="rec-decide">
                        <span className={'rec-st ' + r.status}>{{ present: 'Present', excused: 'Excused' }[r.status] || 'Absent'}</span>
                        {r.status === 'absent' && (marking?.userId === r.userId ? (
                          <>
                            <select aria-label="Why" value={marking.reason} onChange={(e) => setMarking({ ...marking, reason: e.target.value })}>
                              <option value="no_internet">No internet</option>
                              <option value="phone_problem">Phone problem</option>
                              <option value="other">Other</option>
                            </select>
                            <button className="rec-yes" onClick={() => mark(r, marking.reason)}>Confirm</button>
                            <button className="rec-no" onClick={() => setMarking(null)}>Cancel</button>
                          </>
                        ) : (
                          <button className="rec-yes ghost" onClick={() => setMarking({ userId: r.userId, reason: 'no_internet' })} title="For a student who was in class but had no internet or a phone problem">Mark present</button>
                        ))}
                      </span>
                    )}
                  </td>
                  <td><span className={'rec-pct ' + (total < 80 ? 'low' : '')}>{total}%</span></td>
                  <td><button className="rec-view" onClick={() => setHist(r)}>History</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hist && <StudentHistory student={hist} onClose={() => setHist(null)} />}
    </div>
  );
}

/* =========================================================
   A student's attendance in every semester (only for students I teach now)
   GET /teacher/students/:id/history
   ========================================================= */
export function StudentHistory({ student, onClose }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api(`/teacher/students/${encodeURIComponent(student.userId)}/history`).then(setD).catch((e) => setErr(e.message));
  }, [student.userId]);
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  const sems = d?.semesters || [];
  const now = sems.find((x) => x.current), before = sems.find((x) => !x.current && x.overall != null);
  const pct = (v) => (v == null ? 'No classes' : `${v}%`);
  const trend = now?.overall != null && before ? now.overall - before.overall : null;
  return (
    <div className="cc-shade" onClick={onClose}>
      <div className="cc-box sh-box" role="dialog" aria-modal="true" aria-label={`Attendance history of ${student.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="sh-head">
          <div><h3>{student.name}</h3><small>{student.userId} · attendance in every semester</small></div>
          <button className="sh-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {err && <p className="rec-err">{err}</p>}
        {!d && !err && <div className="skel skel-row" style={{ height: 90 }} />}
        {d && (
          <>
            {before ? (
              <p className={'sh-compare ' + (trend < -5 ? 'down' : trend > 5 ? 'up' : '')}>
                This semester <b>{pct(now?.overall)}</b> · {before.name} <b>{pct(before.overall)}</b>
                {trend != null && (trend < -5 ? ' · dropping ↓' : trend > 5 ? ' · improving ↑' : ' · about the same')}
              </p>
            ) : (
              <p className="sh-compare">No earlier semester on record for this student.</p>
            )}
            {sems.map((x) => (
              <section key={x.code} className="sh-sem">
                <h4>{x.name}{x.current ? ' (current)' : ''} <span>{pct(x.overall)}</span></h4>
                <table>
                  <tbody>
                    {x.modules.map((m) => (
                      <tr key={m.code}>
                        <td>{m.code}</td>
                        <td>{m.name}</td>
                        <td className={m.atRisk || m.belowRequired ? 'low' : m.covered ? 'cov' : ''}>
                          {pct(m.pct)}{m.covered ? ' · 80% rule (approved leave)' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}