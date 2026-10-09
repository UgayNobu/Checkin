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

  const lowModule = modules.find((m) => m.pct < 90);

  /* ---------- One module: theory / practical tables ---------- */
  if (selected) {
    return (
      <div className="dash">
        <button className="back" onClick={close}>← Back</button>

        {records && ['theory', 'practical'].filter((t) => records[t].rows.length).map((t) => (
          <section key={t} className="mod">
            <div className="mhead">
              <div>
                <h3>{selected.name}</h3>
                <div className="total">Total percentage {records[t].pct}%</div>
              </div>
              <b className="kind">{t === 'theory' ? 'Theory class' : 'Practical class'}</b>
            </div>

            <div className="tbl">
              <table>
                <thead>
                  <tr><th>Date</th><th>Hour</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {records[t].rows.map((r, i) => (
                    <tr key={i}>
                      <td>{fmt(r.date)}</td>
                      <td>{r.hours} hr</td>
                      <td><span className={'badge ' + r.status}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
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

        <div className="chart">
          <div className="axis">
            {AXIS.map((n) => <span key={n}>{n}</span>)}
          </div>
          <div className="plot">
            {modules.map((m) => (
              <div key={m.id} className="col">
                <div className="bar" style={{ height: cap(m.pct) * 2 }}>{Math.round(cap(m.pct))}%</div>
                <small>{m.name}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}