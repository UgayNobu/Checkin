// Tutor Dashboard: today first, then Reports & Analytics (merged here from its own page).
//   1. Welcome line and the date
//   2. Today's classes, each with Start attendance (or Live / Taken): timetable classes plus
//      extra classes booked for today and classes this tutor covers; cancelled ones are marked
//   3. Reports: headline tiles, weekly chart, modules and students who need attention
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, auth } from '../../api';
import { t12 } from '../../time12';
import Reports from './Reports.jsx';
import './staff.css';

const hello = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

// Bhutan date (UTC+6), the same "today" the Timetable uses
const todayBT = () => new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * Today's classes for the dashboard, like the Timetable shows them:
 *  • this tutor's timetable classes (with any change: cancelled, or given to a cover tutor)
 *  • extra classes booked today for this tutor's modules (or booked by them)
 *  • classes of other tutors that this tutor is covering
 * Each item has `link` = where Start attendance goes, or `note` when it can't be started.
 */
export function todaysClasses(slots, changes, { today, myId, myModules }) {
  const ofDay = (changes || []).filter((c) => c.date === today);
  const bySlot = new Map(ofDay.filter((c) => c.slotId).map((c) => [c.slotId, c]));
  const fromChange = (c, kind) => ({
    kind, key: c.id, start: c.start, end: c.end, module: c.module, type: c.sessionType, room: c.room, place: c.place,
    session: c.session, link: '/start?change=' + c.id,
  });
  const items = (slots || []).filter((x) => x.isToday && x.teaches).map((x) => {
    const c = bySlot.get(x.id);
    const it = { ...x, kind: 'slot', key: x.id, link: '/start?slot=' + x.id };
    if (c?.type === 'cancelled') return { ...it, link: null, note: ['off', 'Cancelled'] };
    if (c?.type === 'cover' && c.coverTutor?.id !== myId) return { ...it, link: null, note: ['off', `Covered by ${c.coverTutor?.name || 'another tutor'}`] };
    return it;
  });
  ofDay.filter((c) => c.type === 'cover' && c.coverTutor?.id === myId && !items.some((x) => x.id === c.slotId))
    .forEach((c) => items.push({ ...fromChange(c, 'cover'), tag: 'Cover' }));
  ofDay.filter((c) => c.type === 'extra' && (myModules.has(c.module?.id) || c.by?.id === myId))
    .forEach((c) => items.push({ ...fromChange(c, 'extra'), tag: c.counts === false ? 'Optional' : 'Extra class' }));
  return items.sort((a, b) => a.start.localeCompare(b.start));
}

/** Where a class of today stands right now: [css class, label] */
export function classState(x, nowHM = new Date().toTimeString().slice(0, 5)) {
  if (x.note) return x.note;
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
    const day = todayBT(), u = auth.get()?.user;
    Promise.all([
      api('/teacher/timetable'),
      api(`/class-changes?from=${day}&to=${day}`).catch(() => []),
      api('/teacher/modules').catch(() => []),
    ])
      .then(([slots, changes, mods]) => setToday(todaysClasses(Array.isArray(slots) ? slots : [], Array.isArray(changes) ? changes : [], {
        today: day, myId: u?.userId || u?._id || u?.id, myModules: new Set((Array.isArray(mods) ? mods : []).map((m) => m.id)),
      })))
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
            <span>No classes today. Booked an extra class? It shows here for the day it is booked.</span>
            <button className="td-start" onClick={() => nav('/start')}>Start attendance</button>
          </div>
        ) : (
          <div className="td-classes">
            {today.map((x) => {
              const [k, label] = classState(x);
              return (
                <div className={'td-class ' + k} key={x.key}>
                  <div className="td-time"><b>{t12(x.start)}</b><small>to {t12(x.end)}</small></div>
                  <div className="td-info">
                    <b>{x.module.code} · {x.module.name}{x.tag && <em className="td-tag">{x.tag}</em>}</b>
                    <small>{x.type === 'practical' ? 'Practical' : 'Theory'}{x.room ? ` · ${x.room.name}` : x.place ? ` · ${x.place}` : ''}{x.group ? ` · Group ${x.group}` : ''}</small>
                  </div>
                  <span className={'td-pill ' + k}>{k === 'live' && <i />}{label}</span>
                  {k === 'live'
                    ? <button className="td-start" onClick={() => nav('/start')}>Open live view</button>
                    : k === 'taken' && x.session?.id
                      ? <button className="td-start ghosty" onClick={() => nav(`/records/${x.module.id}/${x.session.id}`)}>View record</button>
                      : x.link && k !== 'taken' && k !== 'past' && <button className="td-start" onClick={() => nav(x.link)}>Start attendance</button>}
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
