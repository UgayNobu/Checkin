import { coverOf } from '../teacher/Modules.jsx';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import SemesterPicker, { useSemester } from '../shared/SemesterPicker.jsx';
import './dashboard.css';

const fmt = (d) => new Date(d).toLocaleDateString('en', { month: 'short', day: '2-digit', year: 'numeric' });
const AXIS = [100, 80, 60, 40, 20, 0];
const cap = (n) => Math.min(Math.max(n, 0), 100); // attendance can never show above 100%

export default function Dashboard() {
  const nav = useNavigate();
  const [modules, setModules] = useState(null); // null = still loading
  const [selected, setSelected] = useState(null);
  const [records, setRecords] = useState(null);

  // Past semesters can be viewed too (read-only): the choice is kept in the URL (?session=AS2026)
  const { session, setSession, qs } = useSemester();
  useEffect(() => { setModules(null); setSelected(null); api('/student/dashboard' + qs).then(setModules).catch(() => setModules([])); }, [qs]);

  const open = (m) => {
    setSelected(m);
    api(`/student/modules/${m.id}/records${qs}`).then(setRecords);
  };
  const close = () => { setSelected(null); setRecords(null); };

  // modules with no classes held yet have pct = null: no warning, no bar
  // RUB rule: 90% is needed; 80–90% is allowed when approved medical/official leave covers the module
  const lowModule = (modules || []).find((m) => m.pct != null && (m.belowRequired || m.atRisk));
  const coveredModule = (modules || []).find((m) => m.covered);

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

  if (!modules) return <div className="dash"><p className="dash-loading">Loading…</p></div>;

  /* ---------- Not enrolled in any module yet: say so, instead of an empty chart ---------- */
  if (!modules.length) {
    return (
      <div className="dash">
        <SemesterPicker session={session} setSession={setSession} />
        {session ? (
          <div className="dash-empty"><h3>No modules in that semester</h3><p>You weren't enrolled in any module then.</p></div>
        ) : (
          <div className="dash-empty">
            <div className="dash-empty-icon" aria-hidden="true">📚</div>
            <h3>You're not enrolled in any modules yet</h3>
            <p>Join your classes to see your attendance here. You'll need the enrolment key from your tutor.</p>
            <button type="button" onClick={() => nav('/settings/enrol')}>Enrol in a module</button>
          </div>
        )}
      </div>
    );
  }

  /* ---------- Main dashboard ---------- */
  return (
    <div className="dash">
      <SemesterPicker session={session} setSession={setSession} />
      {session && <p className="mut" style={{ margin: '0 0 12px', fontSize: 13 }}>You are looking at a past semester. These records are read-only.</p>}
      {lowModule && !session && (
        <div className="alert">
          ⚠ Attendance {lowModule.atRisk ? 'below 80%' : 'below 90%'} in {lowModule.name} ({lowModule.code})
          {lowModule.atRisk ? ': under 80% you cannot sit the exam, even with approved documents.' : ''}
        </div>
      )}
      {coveredModule && !lowModule && !session && (
        <div className="alert covered">
          ℹ {coveredModule.code} is at {coveredModule.pct}%. Because your medical or official leave was approved, the 80% rule applies to you in this module instead of 90%.
        </div>
      )}

      <h3>Course-by-Course Attendance</h3>
      <div className="courses">
        {modules.map((m) => (
          <div className="course" key={m.id}>
            <div className="course-img" style={{ backgroundImage: coverOf(m) }} aria-hidden="true" />
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
                    className={'sdc-bar' + (m.belowRequired || m.atRisk ? ' low' : m.covered ? ' covered' : '')}
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