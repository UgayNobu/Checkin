import { useEffect, useState } from 'react';
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
   Programs list (was: Departments list / Module tab)
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
      <h2 className="ttl">Programs</h2>                     {/* ← was 'Module' */}
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
   Department detail page (stat cards + BAR GRAPH)
   ========================================================= */
export function Department() {
  const { name } = useParams(), nav = useNavigate();
  const [year, setYear] = useState(''), [mod, setMod] = useState('');
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

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

  // Build the bar chart data — only when real trend data exists
  const trend = d?.trend && d.trend.length > 0 ? d.trend : [0, 0, 0, 0, 0, 0];
  const maxVal = 100; // percentages max at 100
  const chartWidth = 600;
  const chartHeight = 140;
  const barCount = trend.length;
  const gap = 20;
  const barWidth = (chartWidth - gap * (barCount + 1)) / barCount;

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

      {/* Stat cards */}
      <div className="stats">
        <Stat l="Total Students" v={d?.students} chip="Active Status" cls="g" />
        <Stat
          l="Average Attendance"
          v={d?.avg != null ? `${d.avg}%` : null}
          chip="Target Exceeded"
          cls="g"
        />
        <Stat
          l="Students At Risk"
          v={d?.atRisk}
          chip="Below 80% Threshold"
          cls="r"
        />
      </div>

      {/* Bar Chart */}
      <div className="trend-card">
        <div className="trend-header">
          <b>Attendance Rate Trend</b>
          <small>Goal: 85%</small>
        </div>

        <div className="bar-chart">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="none"
            className="bar-svg"
          >
            {/* Goal line at 85% */}
            <line
              x1="0"
              y1={chartHeight - (85 / maxVal) * chartHeight}
              x2={chartWidth}
              y2={chartHeight - (85 / maxVal) * chartHeight}
              stroke="#f59e0b"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.5"
            />

            {/* Bars */}
            {trend.map((val, i) => {
              const barHeight = (val / maxVal) * chartHeight;
              const x = gap + i * (barWidth + gap);
              const y = chartHeight - barHeight;
              return (
                <g key={i}>
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx="4"
                    fill="#1ea7e8"
                  />
                  {/* Value label above each bar */}
                  {val > 0 && (
                    <text
                      x={x + barWidth / 2}
                      y={y - 5}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#1b2745"
                      fontWeight="600"
                    >
                      {val}%
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="trend-weeks">
          {trend.map((_, i) => <span key={i}>week {i + 1}</span>)}
        </div>
      </div>

      {/* Year + Module selectors */}
      <div className="selectors-card">
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="year-select"
        >
          <option value="">YEAR -</option>
          {[1, 2, 3, 4].map((y) => <option key={y} value={y}>YEAR - {y}</option>)}
        </select>

        <select
          value={mod}
          onChange={(e) => setMod(e.target.value)}
          className="module-select"
        >
          <option value="">MODULE</option>
          {(d?.modules || [])
            .filter((m) => !year || m.year === +year)
            .map((m) => (
              <option key={m.id} value={m.id}>{m.code} – {m.name}</option>
            ))}
        </select>

        <button className="go-btn" onClick={() => mod && nav('/module/' + mod)}>
          VIEW
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   Module detail page
   ========================================================= */
export function ModuleView() {
  const { id } = useParams(), nav = useNavigate(), [d, setD] = useState(null);

  useEffect(() => {
    api('/management/module/' + id).then(setD).catch(console.error);
  }, [id]);

  return (
    <div className="mg">
      <Back />
      <div className="stats">
        <Stat l="Total Students" v={d?.totals?.students} />
        <Stat l="Total Absence" v={d?.totals?.absence} />
        <Stat l="Total Approve/ Relief Request" v={d?.totals?.relief} />
      </div>
      {d?.rows && (
        <div className="tbl" style={{ maxWidth: 720, marginTop: 20 }}>
          <table>
            <thead>
              <tr><th>NAME</th><th>STUDENT ID</th><th>ABSENT (H)</th><th>ATTENDANCE</th></tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/student/${r.id}/${id}`)}>
                  <td><b>{r.name}</b></td>
                  <td>{r.userId}</td>
                  <td>{r.absentH}hr</td>
                  <td>{r.pct}%</td>
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