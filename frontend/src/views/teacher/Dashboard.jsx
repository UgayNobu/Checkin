// Tutor dashboard: summary cards, today's classes, what needs attention, and the modules the admin assigned.
// Backend: GET /teacher/dashboard (totals, today, modules) and GET /me (name, default-password reminder).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import './staff.css';
import './tdash.css';

const time = (d) => new Date(d).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
const STATUS = { ongoing: ['Running', 'live'], ended: ['Done', 'done'], scheduled: ['Not started', 'wait'] };

export default function Dashboard() {
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [me, setMe] = useState({});

  useEffect(() => {
    api('/teacher/dashboard').then(setD).catch(() => setD({ totals: {}, today: [], modules: [] }));
    api('/me').then(setMe).catch(() => {});
  }, []);

  const t = d?.totals || {};
  const mods = d?.modules || [];
  const today = d?.today || [];
  const needs = (t.flaggedCheckIns || 0) + (t.pendingEvidence || 0);

  return (
    <div className="staff tdash">
      <div className="tdash-head">
        <div>
          <h3>Welcome back, {me.name?.split(' ')[0] || ''}</h3>
          <p className="date">{new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <button className="btn" onClick={() => nav('/start')} disabled={!mods.length}>Start attendance</button>
      </div>

      {me.prefs?.mustChangePassword && (
        <div className="tdash-note warn" role="status">
          <span>You are still using the default password the admin gave you. Change it to keep your account safe.</span>
          <button className="tdash-link" onClick={() => nav('/settings')}>Change password</button>
        </div>
      )}

      {/* Summary cards */}
      <div className="stats">
        <div className="stat"><b>{d ? t.modules ?? mods.length : '—'}</b><small>Modules this semester</small></div>
        <div className="stat"><b>{d ? t.students ?? 0 : '—'}</b><small>Students across your modules</small></div>
        <div className={'stat' + (t.flaggedCheckIns ? ' warn' : '')}><b>{d ? t.flaggedCheckIns ?? 0 : '—'}</b><small>Flagged check-ins to review</small></div>
        <div className={'stat' + (t.pendingEvidence ? ' warn' : '')}><b>{d ? t.pendingEvidence ?? 0 : '—'}</b><small>Evidence documents pending</small></div>
      </div>

      {d && !mods.length && (
        <div className="tdash-empty">
          <b>No modules assigned yet</b>
          <p>The admin assigns your modules for each semester. Once they do, they appear here and you can start attendance. You will also get an email.</p>
        </div>
      )}

      {needs > 0 && (
        <div className="tdash-note warn">
          <span>
            {t.flaggedCheckIns ? `${t.flaggedCheckIns} flagged check-in${t.flaggedCheckIns > 1 ? 's' : ''} need a decision. ` : ''}
            {t.pendingEvidence ? `${t.pendingEvidence} evidence document${t.pendingEvidence > 1 ? 's are' : ' is'} waiting for management.` : ''}
          </span>
          <span className="tdash-actions">
            {t.flaggedCheckIns > 0 && <button className="tdash-link" onClick={() => nav('/records')}>Review check-ins</button>}
            {t.pendingEvidence > 0 && <button className="tdash-link" onClick={() => nav('/evidence')}>View evidence</button>}
          </span>
        </div>
      )}

      {/* Today's classes */}
      <h4 className="tdash-h">Today's classes</h4>
      <div className="tbl">
        <table>
          <thead><tr><th>Time</th><th>Module</th><th>Type</th><th>Room</th><th>Checked in</th><th>Status</th></tr></thead>
          <tbody>
            {today.length === 0 ? (
              <tr><td colSpan={6} className="tdash-none">{d ? 'No attendance sessions today yet. Start one from your Timetable or Start Attendance.' : 'Loading…'}</td></tr>
            ) : today.map((s) => {
              const [label, cls] = STATUS[s.status] || [s.status, 'wait'];
              return (
                <tr key={s._id}>
                  <td>{time(s.start)}</td>
                  <td><b>{s.code}</b> – {s.name}</td>
                  <td className="tdash-cap">{s.type}</td>
                  <td>{s.room || '–'}</td>
                  <td>{s.checkedIn} / {s.enrolled}</td>
                  <td><span className={'pill ' + (cls === 'done' ? 'ok' : cls === 'live' ? 'b' : 'o')}>{label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modules assigned by the admin */}
      <h4 className="tdash-h">Your modules</h4>
      <div className="tbl">
        <table>
          <thead><tr><th>Module</th><th>Year / Semester</th><th>Students</th><th>Enrolment key</th><th></th></tr></thead>
          <tbody>
            {mods.length === 0 ? (
              <tr><td colSpan={5} className="tdash-none">{d ? 'No modules assigned yet.' : 'Loading…'}</td></tr>
            ) : mods.map((x) => (
              <tr key={x.id}>
                <td><b>{x.code}</b> – {x.name}</td>
                <td>{x.year ? `Year ${x.year}` : '–'}{x.semester ? ` · Sem ${x.semester}` : ''}</td>
                <td className="blue-t">{x.students}</td>
                <td>{x.enrolmentKey ? <span className="pill ok">Key set</span> : <span className="pill o">No key yet</span>}</td>
                <td><button className="addb" onClick={() => nav('/modules/' + x.id)}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
