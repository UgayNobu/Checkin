import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
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
  const [mods, setMods] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api('/teacher/modules')
      .then((r) => setMods(Array.isArray(r) ? r : []))
      .catch(() => setMods([]))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  return (
    <div className="recs">
      {mods.length === 0 ? (
        <div className="rec-box rec-empty-box">
          <b>No modules assigned yet</b>
          <small>Modules appear here once an admin assigns them to you.</small>
        </div>
      ) : (
        <div className="rec-modgrid">
          {mods.map((m) => (
            <button className="rec-modcard" key={m.id} onClick={() => nav('/records/' + m.id)}>
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

/* =========================================================
   Page 1: every session of one module   (/records/:id)
   ========================================================= */
export function RecordStudents() {
  const { id } = useParams();
  const nav = useNavigate();
  const [mod, setMod] = useState(null);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState(''); // date search (YYYY-MM-DD)
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([api('/teacher/modules'), api('/sessions/mine?limit=100')])
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
  }, [id]);

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
        <button className="rec-back" onClick={() => nav('/records')}>&lt; back</button>
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
                  </td>
                  <td className="rec-cap">{r.type}</td>
                  <td>{r.hours} hr</td>
                  <td className="rec-g">{c ? c.present : '–'}</td>
                  <td className="rec-r">
                    {c ? c.absent : '–'}
                    {c?.flagged > 0 && <small className="rec-flagnote"> +{c.flagged} to review</small>}
                  </td>
                  <td><span className={'rec-pct ' + (p !== null && p < 80 ? 'low' : '')}>{p !== null ? `${p}%` : '–'}</span></td>
                  <td><button className="rec-view" onClick={() => nav(`/records/${id}/${r._id}`)}>View</button></td>
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
  const [data, setData] = useState(null); // roster
  const [totals, setTotals] = useState({}); // userId -> total % in the module
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  const load = () => {
    api(`/sessions/${sid}/roster`).then(setData).catch((e) => setErr(e.message));
    api(`/teacher/records/${id}`)
      .then((l) => {
        const map = {};
        (Array.isArray(l) ? l : []).forEach((x) => { map[x.userId || x.id] = x.total ?? x.pct ?? 0; });
        setTotals(map);
      })
      .catch(() => setTotals({}));
  };
  useEffect(load, [id, sid]);

  // Teacher decides a flagged check-in: Present (accept) or Absent (reject)
  const decide = (r, accept) =>
    api(`/sessions/${sid}/flagged/${r.attendanceId}/${accept ? 'accept' : 'reject'}`, {})
      .then(load)
      .catch((e) => setErr(e.message));

  if (err && !data) {
    return (
      <div className="recs">
        <button className="rec-back" onClick={() => nav('/records/' + id)}>&lt; back</button>
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
        <button className="rec-back" onClick={() => nav('/records/' + id)}>&lt; back</button>
        <button className="rec-dl" onClick={download} disabled={!rows.length}>Download</button>
      </div>

      <div className="rec-title">
        <h2>{data.session?.module?.code} – {data.session?.module?.name}</h2>
        <small>
          {niceDate(data.session?.date)} · <span className="rec-cap">{data.session?.type}</span> ·{' '}
          <span className="rec-g">{c.present ?? 0} present</span> ·{' '}
          <span className="rec-r">{c.absent ?? 0} absent</span>
          {c.flagged > 0 && <> · <span className="rec-o">{c.flagged} to review</span></>}
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
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="rec-empty">{q ? 'No student matches that search.' : 'No students enrolled.'}</td></tr>
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
                      <span className={'rec-st ' + r.status}>{r.status === 'present' ? 'Present' : 'Absent'}</span>
                    )}
                  </td>
                  <td><span className={'rec-pct ' + (total < 80 ? 'low' : '')}>{total}%</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}