// Tutor: Reports & Analytics (VLE style)
//  • headline tiles: overall attendance, classes held, students below 90%, flagged check-ins
//  • weekly trend: one line per module over the last 6 weeks, with the 90% requirement line
//  • modules: each module's overall % against 90%
//  • students who need attention: everyone under 90%, lowest first (click → their record)
// Data: GET /teacher/reports (weekly rates, null = no class that week) and
//       GET /teacher/records/:moduleId (each student's % and flagged count).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import './reports.css';

const REQUIRED = 90;
// Categorical slots 1–3 of the validated palette (fixed order: module 1, 2, 3)
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a'];
const colorOf = (i) => SERIES[i % SERIES.length];
const r0 = (v) => Math.round(Number(v) || 0);
const short = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/* ---------- Weekly trend (SVG line chart with hover) ---------- */
function Trend({ mods }) {
  const [hover, setHover] = useState(null);
  // Draw at the real pixel width so text stays at its normal size
  const box = useRef(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const narrow = W < 560;
  const H = narrow ? 240 : 300, L = 44, R = narrow ? 70 : 104, T = 16, B = 34;
  const n = mods[0]?.weeks?.length || 6;
  const step = (W - L - R) / (n - 1);
  const x = (i) => L + i * step;
  const y = (v) => T + ((100 - v) * (H - T - B)) / 100;
  const labels = (mods[0]?.weekStarts || []).map((d, i) => (i === n - 1 ? (narrow ? 'Now' : 'This week') : short(d)));

  // Lines break at weeks with no class (null)
  const paths = mods.map((m) => {
    let d = '', pen = false;
    m.weeks.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  });
  // Direct label at each module's last week with a class (nudged apart if they collide)
  const ends = mods.map((m, i) => {
    const k = m.weeks.map((v, j) => (v == null ? -1 : j)).filter((j) => j >= 0).pop();
    return k == null ? null : { i, k, v: m.weeks[k], ly: y(m.weeks[k]) };
  }).filter(Boolean).sort((a, b) => a.ly - b.ly);
  for (let j = 1; j < ends.length; j++) if (ends[j].ly - ends[j - 1].ly < 16) ends[j].ly = ends[j - 1].ly + 16;

  return (
    <div className="rp-chart" ref={box} onMouseLeave={() => setHover(null)}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weekly attendance by module, last 6 weeks">
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} className="rp-grid" />
            <text x={L - 8} y={y(g) + 4} className="rp-axis" textAnchor="end">{g}%</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(REQUIRED)} y2={y(REQUIRED)} className="rp-target" />
        <text x={W - R + 6} y={y(REQUIRED) + 4} className="rp-target-label">{narrow ? `${REQUIRED}%` : `${REQUIRED}% required`}</text>
        {labels.map((t, i) => (narrow && i % 2 === 0 && i !== n - 1 ? null : <text key={i} x={x(i)} y={H - 10} className="rp-axis" textAnchor="middle">{t}</text>))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="rp-cross" />}
        {paths.map((d, i) => <path key={i} d={d} fill="none" stroke={colorOf(i)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
        {mods.map((m, i) => m.weeks.map((v, j) => (v == null ? null : (
          <circle key={`${i}-${j}`} cx={x(j)} cy={y(v)} r={hover === j ? 6 : 4.5} fill={colorOf(i)} stroke="#fff" strokeWidth="2" />
        ))))}
        {ends.map((e) => (
          <text key={e.i} x={x(e.k) + 10} y={e.ly + 4} className="rp-end">{narrow ? '' : mods[e.i].code + ' '}{r0(e.v)}%</text>
        ))}
        {/* hover columns, wider than the marks */}
        {labels.map((_, i) => (
          <rect key={i} x={x(i) - step / 2} y={T} width={step} height={H - T - B}
            fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} />
        ))}
      </svg>
      {hover != null && (
        <div className={'rp-tip' + (hover >= n - 2 ? ' left' : '')} style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{hover === n - 1 ? 'This week' : `Week of ${labels[hover]}`}</b>
          {mods.map((m, i) => (
            <span key={m.id}>
              <i style={{ background: colorOf(i) }} />{m.code}
              <em>{m.weeks[hover] == null ? 'no class' : `${r0(m.weeks[hover])}% · ${m.weekClasses[hover]} class${m.weekClasses[hover] > 1 ? 'es' : ''}`}</em>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Reports() {
  const nav = useNavigate();
  const [mods, setMods] = useState(null);
  const [rows, setRows] = useState({}); // moduleId → student rows

  useEffect(() => {
    const load = () =>
      api('/teacher/reports')
        .then(async (r) => {
          const list = Array.isArray(r) ? r : [];
          setMods(list);
          const recs = await Promise.all(list.map((m) => api(`/teacher/records/${m.id}`).then((x) => [m.id, Array.isArray(x) ? x : []]).catch(() => [m.id, []])));
          setRows(Object.fromEntries(recs));
        })
        .catch(() => setMods([]));
    load();
    const t = setInterval(load, 30000); // pick up new check-ins
    return () => clearInterval(t);
  }, []);

  const k = useMemo(() => {
    if (!mods) return null;
    const held = mods.filter((m) => m.overall != null);
    const classes = mods.reduce((a, m) => a + (m.classes || 0), 0);
    // weighted by class size × classes, so a big module counts more than a tiny one
    const wsum = held.reduce((a, m) => a + m.classes * (m.students || 0), 0);
    const overall = wsum ? held.reduce((a, m) => a + m.overall * m.classes * (m.students || 0), 0) / wsum : null;
    const low = held.flatMap((m) => (rows[m.id] || []).filter((s) => s.total < REQUIRED).map((s) => ({ ...s, module: m })))
      .sort((a, b) => a.total - b.total);
    const flagged = Object.values(rows).flat().reduce((a, s) => a + (s.flagged || 0), 0);
    return { classes, overall, low, flagged };
  }, [mods, rows]);

  if (!mods) return <p className="mut">Loading reports…</p>;
  if (!mods.length) return <div className="rp-card rp-empty"><b>No modules yet</b><span>Reports appear once the admin assigns you a module.</span></div>;

  const tiles = [
    { label: 'Overall attendance', value: k.overall == null ? '–' : `${r0(k.overall)}%`, note: k.overall == null ? 'No classes yet' : k.overall < REQUIRED ? `Below the ${REQUIRED}% requirement` : `At or above ${REQUIRED}%`, tone: k.overall != null && k.overall < REQUIRED ? 'bad' : '' },
    { label: 'Classes held', value: k.classes, note: `Across ${mods.length} module${mods.length > 1 ? 's' : ''} this semester` },
    { label: `Students below ${REQUIRED}%`, value: k.low.length, note: k.low.length ? 'Listed below' : 'Everyone is on track', tone: k.low.length ? 'bad' : '' },
    { label: 'Flagged check-ins', value: k.flagged, note: 'Uncertain location, decided by you' },
  ];

  return (
    <div className="rp">
      <div className="rp-tiles">
        {tiles.map((t) => (
          <div className="rp-card rp-tile" key={t.label}>
            <small>{t.label}</small>
            <b className={t.tone}>{t.value}</b>
            <span>{t.note}</span>
          </div>
        ))}
      </div>

      <div className="rp-card">
        <div className="rp-head">
          <h3>Weekly attendance</h3>
          <span className="mut">Last 6 weeks · % of students present per class</span>
        </div>
        <div className="rp-legend">
          {mods.map((m, i) => <span key={m.id}><i style={{ background: colorOf(i) }} />{m.code} – {m.name}</span>)}
          <span><i className="rp-dash" />{REQUIRED}% required</span>
        </div>
        {mods.some((m) => m.weeks.some((v) => v != null))
          ? <Trend mods={mods} />
          : <p className="rp-none">No classes in the last 6 weeks.</p>}
      </div>

      <div className="rp-two">
        <div className="rp-card">
          <div className="rp-head"><h3>Modules</h3><span className="mut">Whole semester</span></div>
          <div className="rp-mods">
            {mods.map((m, i) => (
              <button className="rp-mod" key={m.id} onClick={() => nav('/records/' + m.id)}>
                <div className="rp-mod-top">
                  <span><i style={{ background: colorOf(i) }} /><span><b>{m.code}</b>&nbsp; {m.name}</span></span>
                  <b className={m.overall != null && m.overall < REQUIRED ? 'bad' : ''}>{m.overall == null ? 'No classes yet' : `${r0(m.overall)}%`}</b>
                </div>
                <div className="rp-track" aria-hidden="true">
                  {m.overall != null && <span className="rp-fill" style={{ width: `${Math.min(100, m.overall)}%`, background: colorOf(i) }} />}
                  <span className="rp-mark" style={{ left: `${REQUIRED}%` }} />
                </div>
                <small>{m.classes} class{m.classes === 1 ? '' : 'es'} · {m.students} student{m.students === 1 ? '' : 's'}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="rp-card">
          <div className="rp-head"><h3>Students who need attention</h3><span className="mut">Below {REQUIRED}%, lowest first</span></div>
          {k.low.length === 0 ? (
            <p className="rp-none">No student is below {REQUIRED}%.</p>
          ) : (
            <div className="rp-tbl">
              <table>
                <thead><tr><th>Student</th><th>Module</th><th className="num">Attendance</th><th className="num rp-flag">Flagged</th></tr></thead>
                <tbody>
                  {k.low.map((s) => (
                    <tr key={s.module.id + s.userId} onClick={() => nav(`/records/${s.module.id}/${s.userId}`)} className="rp-row">
                      <td><b>{s.name}</b><small>{s.userId}</small></td>
                      <td>{s.module.code}</td>
                      <td className="num"><span className="rp-pct">{r0(s.total)}%</span></td>
                      <td className="num rp-flag">{s.flagged || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
