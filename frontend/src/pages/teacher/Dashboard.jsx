// Tutor Dashboard: today first, then Reports & Analytics (merged here from its own page).
//   1. Welcome line and the date
//   2. Today's classes, each with Start attendance (or Live / Taken)
//   3. Reports: headline tiles, weekly chart, modules and students who need attention
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { t12 } from '../../time12';
import Reports from './Reports.jsx';
import './staff.css';

const hello = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

/** Where a class of today stands right now: [css class, label] */
export function classState(x, nowHM = new Date().toTimeString().slice(0, 5)) {
  const st = x.session?.status;
  if (st === 'ongoing') return ['live', 'Checking in now'];
  if (st === 'ended') return ['taken', 'Attendance taken'];
  if (x.end <= nowHM) return ['past', 'Finished'];
  if (x.start <= nowHM) return ['now', 'Happening now'];
  return ['next', 'Later today'];
}

export default function Dashboard() {
  const nav = useNavigate();
  const [me, setMe] = useState({});
  const [today, setToday] = useState(null);
  useEffect(() => {
    api('/me').then(setMe).catch(() => {});
    api('/teacher/timetable')
      .then((l) => setToday((Array.isArray(l) ? l : []).filter((x) => x.isToday && x.teaches).sort((a, b) => a.start.localeCompare(b.start))))
      .catch(() => setToday([]));
  }, []);

  return (
    <div className="tdash">
      <section className="td-hello">
        <div>
          <h2>{hello()}, {me.name?.split(' ')[0] || 'there'} <span className="td-wave" aria-hidden="true">👋</span></h2>
          <p>{new Date().toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </section>

      <section className="td-card td-today">
        <div className="td-head">
          <h3>Today's classes</h3>
          <button className="td-link" onClick={() => nav('/timetable')}>Full timetable →</button>
        </div>
        {today === null ? (
          <div className="skel skel-row" style={{ height: 64 }} />
        ) : today.length === 0 ? (
          <div className="td-none">
            <span>No classes on your timetable today.</span>
            <button className="td-start" onClick={() => nav('/start')}>Start attendance</button>
          </div>
        ) : (
          <div className="td-classes">
            {today.map((x) => {
              const [k, label] = classState(x);
              return (
                <div className={'td-class ' + k} key={x.id}>
                  <div className="td-time"><b>{t12(x.start)}</b><small>to {t12(x.end)}</small></div>
                  <div className="td-info">
                    <b>{x.module.code} · {x.module.name}</b>
                    <small>{x.type === 'practical' ? 'Practical' : 'Theory'}{x.room ? ` · ${x.room.name}` : ''}{x.group ? ` · Group ${x.group}` : ''}</small>
                  </div>
                  <span className={'td-pill ' + k}>{k === 'live' && <i />}{label}</span>
                  {k === 'live'
                    ? <button className="td-start" onClick={() => nav('/start')}>Open live view</button>
                    : k !== 'taken' && k !== 'past' && <button className="td-start" onClick={() => nav('/start?slot=' + x.id)}>Start attendance</button>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <h3 className="td-section">Reports &amp; analytics <small>How attendance is trending across your modules</small></h3>
      <Reports />
    </div>
  );
}
