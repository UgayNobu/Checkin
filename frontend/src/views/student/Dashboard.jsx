import { useEffect, useState } from 'react';
import { api } from '../../api';
import './dashboard.css';

const fmt = (d) => new Date(d).toLocaleDateString('en', { month: 'short', day: '2-digit', year: 'numeric' });
const AXIS = [100, 80, 60, 40, 20, 0];
const cap = (n) => Math.min(Math.max(n, 0), 100); // attendance can never show above 100%

export default function Dashboard() {
  const [modules, setModules] = useState([]);
  const [selected, setSelected] = useState(null);
  const [records, setRecords] = useState(null);

  useEffect(() => { api('/student/dashboard').then(setModules); }, []);

  const open = (m) => {
    setSelected(m);
    api(`/student/modules/${m.id}/records`).then(setRecords);
  };
  const close = () => { setSelected(null); setRecords(null); };

  // modules with no classes held yet have pct = null: no warning, no bar
  const lowModule = modules.find((m) => m.pct != null && m.pct < 90);

  /* ---------- One module: theory + practical, title on top, table below ---------- */
  if (selected) {
    return (
      <div className="dash">
        <button className="back" onClick={close}>← Back</button>

        {records && ['theory', 'practical'].map((t) => {
          const part = records[t] || { rows: [], pct: 0 };
          return (
            <section key={t} className="sdm">
              <div className="sdm-head">
                <div>
                  <h3>{selected.name}</h3>
                  <span className="sdm-kind">{t === 'theory' ? 'Theory class' : 'Practical class'}</span>
                </div>
                <div className={'sdm-pct' + (part.pct != null && part.pct < 90 ? ' low' : '')}>
                  {part.pct == null ? 'No classes yet' : <>Total percentage <b>{part.pct}%</b></>}
                </div>
              </div>

              <div className="sdm-tbl">
                <table>
                  <thead>
                    <tr><th>Date</th><th>Hour</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {part.rows.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="sdm-empty">
                          No {t} classes recorded yet.
                        </td>
                      </tr>
                    ) : (
                      part.rows.map((r, i) => (
                        <tr key={i}>
                          <td>{fmt(r.date)}</td>
                          <td>{r.hours} hr</td>
                          <td><span className={'badge ' + r.status}>{r.status}</span></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  /* ---------- Main dashboard ---------- */
  return (
    <div className="dash">
      {lowModule && (
        <div className="alert">⚠ Attendance below 90% in {lowModule.name} ({lowModule.code})</div>
      )}

      <h3>Course-by-Course Attendance</h3>
      <div className="courses">
        {modules.map((m) => (
          <div className="course" key={m.id}>
            <b>{m.name}</b>
            <small>{m.code}</small>
            <a onClick={() => open(m)}>view attendance</a>
          </div>
        ))}
      </div>

      <div className="chartbox">
        <h3>Attendance by Module</h3>
        <small>Attendance %</small>

        <div className="sdc">
          <div className="sdc-axis">
            {AXIS.map((n) => <span key={n}>{n}</span>)}
          </div>
          <div className="sdc-main">
            <div className="sdc-plot">
              {modules.map((m) => (
                <div key={m.id} className="sdc-col">
                  <span className="sdc-val">{m.pct == null ? '–' : `${Math.round(cap(m.pct))}%`}</span>
                  <div
                    className={'sdc-bar' + (m.pct != null && m.pct < 90 ? ' low' : '')}
                    style={{ height: cap(m.pct ?? 0) * 2 }}
                    title={m.pct == null ? `${m.name}: no classes yet` : `${m.name}: ${Math.round(cap(m.pct))}%`}
                  />
                </div>
              ))}
            </div>
            <div className="sdc-labels">
              {modules.map((m) => (
                <span key={m.id} title={m.name}>
                  {m.code}
                  <small>{m.name}</small>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}