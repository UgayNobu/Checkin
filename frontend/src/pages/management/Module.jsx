import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import '../teacher/staff.css';
import '../student/attendance.css';
import './Module.css';

const E = encodeURIComponent, GB = (d) => new Date(d).toLocaleDateString('en-GB');

// Show blank when no value, and only show chip when there is data
const Stat = ({ l, v, chip, cls }) => (
  <div className="stat">
    <small>{l}</small>
    <b>{v ?? ''}</b>
    {v != null && chip && (
      <div><span className={'chip ' + (cls || 'g')}>{chip}</span></div>
    )}
  </div>
);

const Back = ({ label = '← Back' }) => {
  const nav = useNavigate();
  return <button className="back-dash" onClick={() => nav(-1)}>{label}</button>;
};

/* =========================================================
   Inline Dropdown — auto-flip up + auto-fit height
   ========================================================= */
function Dropdown({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ openUp: false, maxHeight: 280 });
  const wrapperRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    const handle = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const handleToggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;

      const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
      const available = openUp ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(140, Math.min(280, available));

      setMenuPos({ openUp, maxHeight });
    }
    setOpen(true);
  };

  const selected = options.find((o) => o.value === value);

  return (
    <div className={'dd' + (menuPos.openUp ? ' dd-up' : '')} ref={wrapperRef}>
      <button
        type="button"
        ref={btnRef}
        className={'dd-btn' + (open ? ' open' : '')}
        onClick={handleToggle}
      >
        <span className={selected ? '' : 'dd-placeholder'}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className="dd-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <ul className="dd-menu" style={{ maxHeight: menuPos.maxHeight }}>
          {options.length === 0 ? (
            <li className="dd-empty">No options</li>
          ) : (
            options.map((opt) => (
              <li
                key={opt.value}
                className={'dd-option' + (opt.value === value ? ' selected' : '')}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <span>{opt.label}</span>
                {opt.value === value && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M20 6L9 17l-5-5"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/* =========================================================
   Programs list
   ========================================================= */
export function Departments() {
  const nav = useNavigate();
  const [p, setP] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/admin/programs')
      .then((data) => {
        setP(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error loading programs:', err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="mg">
      <h2 className="ttl">Programs</h2>
      {loading ? (
        <p style={{ color: '#64748b', fontSize: 13 }}>Loading programs...</p>
      ) : p.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: 13 }}>No programs found.</p>
      ) : (
        <div className="dept-grid">
          {p.map((x) => (
            <div className="dept" key={x} onClick={() => nav('/department/' + E(x))}>
              {x}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   Department detail page
   ========================================================= */
export function Department() {
  const { name } = useParams(), nav = useNavigate();
  const [year, setYear] = useState(''), [mod, setMod] = useState('');
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoveredBar, setHoveredBar] = useState(null);

  useEffect(() => {
    setLoading(true);
    api('/management/department/' + E(name))
      .then((data) => {
        setD(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('API Error:', err);
        setLoading(false);
      });
  }, [name]);

  const W = 800, H = 220;
  const PAD = { top: 30, right: 20, bottom: 40, left: 50 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const trend = d?.trend && d.trend.length > 0 ? d.trend : [0, 0, 0, 0, 0, 0];
  const maxY = 100;
  const barCount = trend.length;
  const gap = 24;
  const barW = (innerW - gap * (barCount - 1)) / barCount;

  const yOf = (v) => PAD.top + innerH - (v / maxY) * innerH;
  const isEmpty = trend.every((v) => v === 0);

  const moduleOptions = [
    { value: '', label: 'Select a module' },
    ...(d?.modules || [])
      .filter((m) => !year || m.year === +year)
      .map((m) => ({
        value: String(m.id),
        label: `${m.code} — ${m.name}`,
      })),
  ];

  const yearOptions = [
    { value: '', label: 'All years' },
    ...[1, 2, 3, 4].map((y) => ({ value: String(y), label: `Year ${y}` })),
  ];

  return (
    <div className="mg">
      <div className="dept-header">
        <div>
          <div className="crumb">Programs / <b>{name}</b></div>
          <h2 className="ttl">{name} Attendance</h2>
        </div>
        <button className="back-dash" onClick={() => nav('/')}>
          ← Back to Dashboard
        </button>
      </div>

      <div className="stats">
        <Stat l="Total Students" v={d?.students} chip="Active Status" cls="g" />
        <Stat
          l="Average Attendance"
          v={d?.avg != null ? `${d.avg}%` : null}
          // College rule: 90% attendance. Under 80% = at risk.
          chip={d?.avg == null ? 'No classes yet' : d.avg >= 90 ? 'Meets the 90% rule' : d.avg >= 80 ? 'Below the 90% rule' : 'Below 80%: at risk'}
          cls={d?.avg == null ? 'o' : d.avg >= 90 ? 'g' : d.avg >= 80 ? 'o' : 'r'}
        />
        <Stat
          l="Students At Risk"
          v={d?.atRisk}
          chip="Below 80% Threshold"
          cls="r"
        />
      </div>

      <div className="trend-card">
        <div className="trend-header">
          <div>
            <b>Attendance Rate Trend</b>
            <small className="trend-sub">Weekly attendance percentage across the term</small>
          </div>
          <div className="trend-goal">
            <span className="goal-dot" />
            Goal: 90%
          </div>
        </div>

        <div className="chart-wrap">
          {isEmpty ? (
            <div className="chart-empty-state">
              <div className="chart-empty-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M3 3v18h18M7 14l3-3 4 4 5-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="chart-empty-title">No attendance data yet</div>
              <div className="chart-empty-text">
                Trend will appear once class sessions are recorded
              </div>
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="xMidYMid meet"
              className="bar-svg"
            >
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#93c5fd" />
                </linearGradient>
                <linearGradient id="barGradBelow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#fcd34d" />
                </linearGradient>
              </defs>

              {[0, 25, 50, 75, 100].map((tick) => {
                const y = yOf(tick);
                return (
                  <g key={tick}>
                    <line
                      x1={PAD.left}
                      x2={W - PAD.right}
                      y1={y}
                      y2={y}
                      stroke="#e5e9f2"
                      strokeWidth="1"
                      strokeDasharray={tick === 0 ? '0' : '3 4'}
                    />
                    <text
                      x={PAD.left - 10}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="11"
                      fill="#94a3b8"
                      fontWeight="500"
                    >
                      {tick}%
                    </text>
                  </g>
                );
              })}

              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={yOf(90)}
                y2={yOf(90)}
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="6 4"
              />
              <text
                x={W - PAD.right}
                y={yOf(90) - 6}
                textAnchor="end"
                fontSize="10"
                fill="#d97706"
                fontWeight="600"
              >
                Goal 90%
              </text>

              {trend.map((val, i) => {
                const x = PAD.left + i * (barW + gap);
                const y = yOf(val);
                const h = Math.max(PAD.top + innerH - y, 0);
                const below = val < 90;
                const isHover = hoveredBar === i;
                return (
                  <g
                    key={i}
                    onMouseEnter={() => setHoveredBar(i)}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    <rect
                      x={x + 2}
                      y={y + 2}
                      width={barW}
                      height={h}
                      rx="6"
                      fill="rgba(15,27,61,0.06)"
                    />
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={h}
                      rx="6"
                      fill={below ? 'url(#barGradBelow)' : 'url(#barGrad)'}
                      style={{
                        transition: 'opacity 0.15s',
                        opacity: isHover ? 1 : 0.92,
                      }}
                    >
                      <title>{`Week ${i + 1}: ${val}%`}</title>
                    </rect>
                    {val > 0 && (
                      <text
                        x={x + barW / 2}
                        y={y - 8}
                        textAnchor="middle"
                        fontSize="12"
                        fill="#1b2745"
                        fontWeight="700"
                      >
                        {val}%
                      </text>
                    )}
                    <text
                      x={x + barW / 2}
                      y={H - 12}
                      textAnchor="middle"
                      fontSize="11"
                      fill="#64748b"
                      fontWeight="500"
                    >
                      Week {i + 1}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>

      <div className="selectors-card">
        <div className="selector-group">
          <label className="selector-label">Year</label>
          <Dropdown
            value={year}
            onChange={setYear}
            placeholder="All years"
            options={yearOptions}
          />
        </div>

        <div className="selector-group">
          <label className="selector-label">Module</label>
          <Dropdown
            value={mod}
            onChange={setMod}
            placeholder="Select a module"
            options={moduleOptions}
          />
        </div>

        <button
          className="go-btn"
          onClick={() => mod && nav('/module/' + mod)}
          disabled={!mod}
        >
          View Module
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   Module detail page — professional table
   ========================================================= */
export function ModuleView() {
  const { id } = useParams(), nav = useNavigate(), [d, setD] = useState(null);

  useEffect(() => {
    api('/management/module/' + id).then(setD).catch(console.error);
  }, [id]);

  const attClass = (pct) => (pct >= 90 ? 'good' : pct >= 60 ? 'warn' : 'bad');

  return (
    <div className="mg">
      <Back />

      <div className="stats">
        <Stat l="Total Students" v={d?.totals?.students ?? 0} />
        <Stat l="Total Absence" v={d?.totals?.absence ?? 0} />
        <Stat l="Total Approve/ Relief Request" v={d?.totals?.relief ?? 0} />
      </div>

      {d?.rows && (
        <div className="tbl tbl-module">
          <table>
            <thead>
              <tr>
                <th>NAME</th>
                <th>STUDENT ID</th>
                <th className="ta-center">ABSENT (H)</th>
                <th className="ta-center">ATTENDANCE</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr
                  key={r.id}
                  className="clickable-row"
                  onClick={() => nav(`/student/${r.id}/${id}`)}
                >
                  <td><b>{r.name}</b></td>
                  <td className="mono">{r.userId}</td>
                  <td className="ta-center">
                    {r.absentH > 0 ? (
                      <span className="hours-chip">{r.absentH} hr</span>
                    ) : (
                      <span className="mut">—</span>
                    )}
                  </td>
                  <td className="ta-center">
                    <span className={'att-badge ' + attClass(r.pct ?? 0)}>
                      {r.pct ?? 0}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   Student detail page
   ========================================================= */
export function StudentView() {
  const { id, mid } = useParams(), [d, setD] = useState(null);

  useEffect(() => {
    api(`/management/student/${id}?module=${mid}`).then(setD).catch(console.error);
  }, [id, mid]);

  return (
    <div className="mg">
      <Back />
      <div className="stats">
        <Stat l="Number of days present in class" v={d?.present} />
        <Stat l="Number of days absent in class" v={d?.absent} />
        <Stat l="Total classes taken" v={d?.total} />
      </div>
      {d?.student && (
        <div className="tbl" style={{ maxWidth: 420, marginTop: 20 }}>
          <table>
            <thead>
              <tr><th>NAME</th><th>STUDENT ID</th><th>ATTENDANCE</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><b>{d.student.name}</b></td>
                <td>{d.student.userId}</td>
                <td>{d.pct}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {d?.history && (
        <>
          <h4 style={{ fontSize: 11, marginTop: 24 }}>ATTENDANCE HISTORY</h4>
          <div className="tbl" style={{ maxWidth: 360 }}>
            <table>
              <thead>
                <tr><th>PRESENT</th><th>ABSENT</th></tr>
              </thead>
              <tbody>
                {d.history.map((h, i) => (
                  <tr key={i}>
                    <td>{h.status === 'present' && GB(h.date)}</td>
                    <td>{h.status === 'absent' && <small>{GB(h.date)}</small>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}