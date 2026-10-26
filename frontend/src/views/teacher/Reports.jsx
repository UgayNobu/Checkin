import { useEffect, useState } from 'react';
import { api } from '../../api';
import './staff.css';
import './tdash.css';
import './reports.css';

const C = ['var(--primary)', 'var(--sidebar)', 'var(--primary-soft)'];
const GREY = 'var(--border)';
const AXIS = [100, 80, 60, 40, 20, 0];
const MIN_WEEKS = 6;
// Same thresholds as the backend (.env REQUIRED_ATTENDANCE_PERCENT / AT_RISK_ATTENDANCE_PERCENT)
const REQUIRED = 90, AT_RISK = 80;
const health = (v) => (v >= REQUIRED ? ['On track', 'ok'] : v >= AT_RISK ? ['Watch', 'o'] : ['At risk', 'red']);

// Placeholder shown until the admin assigns a module
const NOT_ASSIGNED = [{ code: '—', name: 'Not assigned', overall: 0, weeks: [] }];

export default function Reports() {
  const [d, setD] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = () =>
      api('/teacher/reports')
        .then((r) => setD(Array.isArray(r) ? r : []))
        .catch(() => setD([]))
        .finally(() => setLoaded(true));

    load();
    const t = setInterval(load, 30000); // pick up new check-ins
    return () => clearInterval(t);
  }, []);

  if (!loaded) return null;

  const unassigned = d.length === 0;
  const mods = unassigned ? NOT_ASSIGNED : d;
  const color = (i) => (unassigned ? GREY : C[i % 3]);
  const pct = (v) => Math.round(Number(v) || 0);

  const weeks = Math.max(MIN_WEEKS, ...mods.map((m) => m.weeks?.length || 0));
  const wkIdx = [...Array(weeks).keys()];

  const real = unassigned ? [] : mods;
  const avg = real.length ? Math.round(real.reduce((a, m) => a + pct(m.overall), 0) / real.length) : 0;
  const atRisk = real.filter((m) => pct(m.overall) < AT_RISK).length;
  const thisWeek = real.length ? Math.round(real.reduce((a, m) => a + pct(m.weeks?.[m.weeks.length - 1]), 0) / real.length) : 0;

  return (
    <div className="rep">
      {/* Summary cards */}
      <div className="stats" style={{ marginBottom: 0 }}>
        <div className="stat"><b>{real.length}</b><small>Modules</small></div>
        <div className="stat"><b>{avg}%</b><small>Average attendance (all weeks)</small></div>
        <div className="stat"><b>{thisWeek}%</b><small>Average attendance this week</small></div>
        <div className={'stat' + (atRisk ? ' warn' : '')}><b>{atRisk}</b><small>Modules below {AT_RISK}%</small></div>
      </div>

      <div className="rtop2">
        {/* Weekly bar chart */}
        <div className="rbox">
          <h4>Weekly Attendance by Module</h4>

          <div className="leg">
            {mods.map((m, i) => (
              <span key={m.code + i}>
                <i style={{ background: color(i) }} />
                {unassigned ? m.name : `${m.code} – ${m.name}`}
              </span>
            ))}
          </div>

          <div className="wchart">
            <div className="waxis">
              {AXIS.map((n) => <span key={n}>{n}</span>)}
            </div>
            <div className="wmain">
              <div className="wcanvas" style={{ '--wk': weeks }}>
                <div className="wplot">
                  {wkIdx.map((w) => (
                    <div className="wg" key={w}>
                      {mods.map((m, i) => {
                        const v = pct(m.weeks?.[w]);
                        return v === 0 ? (
                          <div key={m.code + i} className="b stub" title={`Wk${w + 1}: 0%`} />
                        ) : (
                          <div
                            key={m.code + i}
                            className="b"
                            style={{ height: Math.min(v, 100) * 1.6, background: color(i) }}
                            title={`${m.code} Wk${w + 1}: ${v}%`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="wlabels">
                  {wkIdx.map((w) => <span key={w}>Wk{w + 1}</span>)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Overall rings */}
        <div className="rbox sm">
          <h4>Overall Attendance</h4>
          <div className="rings">
            {mods.map((m, i) => (
              <div key={m.code + i}>
                <div className="ring" style={{ '--c': color(i), '--p': pct(m.overall) }}>
                  <b>{pct(m.overall)}%</b>
                </div>
                <strong>{unassigned ? 'Not assigned' : m.code}</strong>
                {!unassigned && <small>{m.name}</small>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Module performance */}
      <div className="rbox">
        <h4>Module Performance</h4>
        {mods.map((m, i) => (
          <div className="perf" key={m.code + i}>
            <span>{unassigned ? 'Not assigned' : `${m.code} – ${m.name}`}</span>
            <div className="track">
              <div style={{ width: pct(m.overall) + '%', background: color(i) }} />
            </div>
            <b>{pct(m.overall)}%</b>
            {!unassigned && <span className={'pill ' + health(pct(m.overall))[1]}>{health(pct(m.overall))[0]}</span>}
          </div>
        ))}
        {unassigned && (
          <p className="rnote">No modules assigned yet. Modules appear here once an admin assigns them to you.</p>
        )}
      </div>
    </div>
  );
}