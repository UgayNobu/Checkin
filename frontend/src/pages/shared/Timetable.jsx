// Timetable for students and tutors: today's classes first, then any day of the week.
// Data comes from the AS2026 timetable (timetable_slots).
//  • Student: their programme + year, plus modules they're enrolled in.
//  • Tutor: modules the admin assigned to them. "Start attendance" opens the
//    Start Attendance page with the class already filled in.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, auth } from '../../api';
import './timetable.css';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Bhutan time (UTC+6, no daylight saving), so "today" is right on any computer
const bhutan = () => new Date(Date.now() + 6 * 3600 * 1000);
const todayIndex = () => (bhutan().getUTCDay() || 7) - 1; // Monday = 0 … Sunday = 6
const nowHHMM = () => bhutan().toISOString().slice(11, 16);
const dateLabel = () =>
  new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Thimphu' });

const TYPE = { theory: 'Theory', practical: 'Practical', tutorial: 'Tutorial' };
const ATT = { Present: 'ok', Late: 'ok', Absent: 'red', Flagged: 'o', 'Pending review': 'o' };

export default function Timetable() {
  const nav = useNavigate();
  const role = auth.get()?.user?.role;
  const teacher = role === 'teacher';
  const today = todayIndex();
  const [day, setDay] = useState(today < 6 ? today : 0); // Sunday → show Monday
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(nowHHMM());
  const [term, setTerm] = useState(null); // current semester, e.g. Autumn Semester 2026

  useEffect(() => {
    api('/academic-sessions/current').then(setTerm).catch(() => {});
  }, []);

  useEffect(() => {
    api(teacher ? '/teacher/timetable' : '/student/timetable')
      .then((r) => setList(Array.isArray(r) ? r : []))
      .catch((e) => { setErr(e.message); setList([]); });
  }, [teacher]);

  // Keep "Now" / "Next" up to date
  useEffect(() => {
    const t = setInterval(() => setNow(nowHHMM()), 30000);
    return () => clearInterval(t);
  }, []);

  if (!list) return <p className="tt-empty">Loading timetable…</p>;

  const isToday = day === today;
  const classes = list.filter((x) => x.dayOfWeek === day + 1);
  const next = isToday ? classes.find((x) => x.start > now) : null;
  const count = (i) => list.filter((x) => x.dayOfWeek === i + 1).length;

  return (
    <div className="tt">
      <p className="tt-date">{dateLabel()}{term ? ` · ${term.name}` : ''}</p>

      <div className="tt-days" role="tablist">
        {DAYS.map((d, i) => (
          <button key={d} role="tab" aria-selected={day === i} className={'tt-day' + (day === i ? ' on' : '')} onClick={() => setDay(i)}>
            {i === today ? 'Today' : d.slice(0, 3)}
            <small>{count(i) || '–'}</small>
          </button>
        ))}
      </div>

      <h3 className="tt-h">
        {isToday ? "Today's classes" : DAYS[day]} <span>{classes.length} {classes.length === 1 ? 'class' : 'classes'}</span>
      </h3>

      {err && <p className="err">{err}</p>}

      {classes.length === 0 ? (
        <div className="tt-empty">
          {list.length === 0
            ? teacher
              ? 'No classes yet. Once the admin assigns you a module that is on the timetable, its classes appear here.'
              : 'No classes yet. Set your programme and year in your profile, or enrol in a module.'
            : isToday ? 'No classes today.' : `No classes on ${DAYS[day]}.`}
        </div>
      ) : (
        <div className="tt-list">
          {classes.map((x) => {
            const live = isToday && x.start <= now && now < x.end;
            const done = isToday && x.end <= now;
            const se = x.session;
            return (
              <div key={x.id} className={'tt-card' + (live ? ' live' : '') + (done ? ' done' : '')}>
                <div className="tt-time">
                  <b>{x.start}</b>
                  <small>{x.end}</small>
                </div>

                <div className="tt-body">
                  <div className="tt-tags">
                    {live && <span className="pill b">Now</span>}
                    {next && next.id === x.id && <span className="pill o">Next</span>}
                    <span className={'tt-type ' + x.type}>{TYPE[x.type] || x.type}</span>
                    {x.group && <span className="tt-grp">Group {x.group}</span>}
                  </div>
                  <b className="tt-mod">{x.module.code} · {x.module.name}</b>
                  <small className="mut">
                    {x.room ? `Room ${x.room.name}` : 'Room not set'}
                    {x.tutors ? ` · ${x.tutors}` : ''}
                    {teacher ? '' : ` · Year ${x.year}`}
                  </small>
                </div>

                <div className="tt-act">
                  {teacher && isToday && x.teaches && (
                    se ? (
                      <span className={'pill ' + (se.status === 'ended' ? 'ok' : 'b')}>
                        {se.status === 'ended' ? 'Attendance taken' : 'Attendance open'}
                      </span>
                    ) : (
                      !done && <button className="pbtn" onClick={() => nav('/start?slot=' + x.id)}>Start attendance</button>
                    )
                  )}
                  {teacher && !x.teaches && <small className="mut">Not assigned to you</small>}

                  {!teacher && isToday && se && (
                    se.myStatus ? (
                      <span className={'pill ' + (ATT[se.myStatus] || 'b')}>{se.myStatus}</span>
                    ) : se.status === 'ongoing' ? (
                      <button className="pbtn" onClick={() => nav('/attendance')}>Check in</button>
                    ) : null
                  )}
                  {!teacher && x.enrolled === false && <small className="mut">Not enrolled</small>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
