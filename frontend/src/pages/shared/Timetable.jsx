// Timetable for students and tutors, one week at a time.
//  • The weekly timetable (timetable_slots) for the current semester.
//  • Class changes for each date: cancelled, covered by another tutor, or extra classes
//    (backend: classChange.service.js).
//  • Tutor: "Start attendance" opens from 15 minutes before a class until it ends. The ⋯ menu
//    cancels a class or asks another tutor to cover it; "+ Extra class" books a class that
//    isn't on the timetable (counted, or optional = never counts toward anyone's %).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, auth } from '../../api';
import { CancelDialog, CoverDialog, ExtraDialog, UndoDialog } from './ClassChangeDialogs.jsx';
import './timetable.css';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EARLY = 15; // minutes before a class that attendance can be started (START_EARLY_MINUTES on the server)

// Bhutan time (UTC+6, no daylight saving), so "today" is right on any computer
const bhutan = () => new Date(Date.now() + 6 * 3600 * 1000);
const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => ymd(new Date(new Date(s + 'T00:00:00Z').getTime() + n * 86400000));
const todayStr = () => ymd(bhutan());
const nowHHMM = () => bhutan().toISOString().slice(11, 16);
const mondayOf = (s) => addDays(s, -((new Date(s + 'T00:00:00Z').getUTCDay() || 7) - 1));
const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const short = (s, o) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', ...o });

const TYPE = { theory: 'Theory', practical: 'Practical', tutorial: 'Tutorial' };
const ATT = { Present: 'ok', Late: 'ok', Absent: 'red', Flagged: 'o', 'Pending review': 'o' };

export default function Timetable() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const me = auth.get()?.user;
  const teacher = me?.role === 'teacher';
  const myId = me?.userId || me?._id;

  const [now, setNow] = useState(nowHHMM());
  const today = todayStr();
  const thisMonday = mondayOf(today);
  const todayIdx = (new Date(today + 'T00:00:00Z').getUTCDay() || 7) - 1;
  const [monday, setMonday] = useState(thisMonday);
  const [day, setDay] = useState(todayIdx); // 0 = Monday … 6 = Sunday (Sunday tab only shows when needed)
  const [list, setList] = useState(null);
  const [changes, setChanges] = useState([]);
  const [mods, setMods] = useState([]); // tutor's modules (for extra classes)
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [term, setTerm] = useState(null);
  const [dialog, setDialog] = useState(null); // { kind, item | change | module }
  const [menu, setMenu] = useState(null); // key of the card whose ⋯ menu is open
  const [reload, setReload] = useState(0);

  useEffect(() => {
    api('/academic-sessions/current').then(setTerm).catch(() => {});
    if (teacher) api('/teacher/modules').then((r) => setMods(Array.isArray(r) ? r : [])).catch(() => {});
  }, [teacher]);

  useEffect(() => {
    setErr('');
    Promise.all([
      api(`${teacher ? '/teacher/timetable' : '/student/timetable'}?week=${monday}`),
      api(`/class-changes?from=${monday}&to=${addDays(monday, 6)}`).catch(() => []),
    ])
      .then(([r, c]) => { setList(Array.isArray(r) ? r : []); setChanges(Array.isArray(c) ? c : []); })
      .catch((e) => { setErr(e.message); setList([]); });
  }, [teacher, monday, reload]);

  // Keep "Now" / "Next" and the start buttons up to date
  useEffect(() => {
    const t = setInterval(() => setNow(nowHHMM()), 30000);
    return () => clearInterval(t);
  }, []);

  // Opened with ?extra=1 (e.g. from Start Attendance): show the extra class form
  useEffect(() => {
    if (teacher && params.get('extra') && mods.length) {
      setDialog({ kind: 'extra', module: params.get('module') || '' });
      setParams({}, { replace: true });
    }
  }, [teacher, params, mods.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close the ⋯ menu when clicking anywhere else
  useEffect(() => {
    if (!menu) return;
    const close = (e) => !e.target.closest?.('.tt-menu') && setMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menu]);

  const myModules = useMemo(() => new Set(mods.map((m) => m.id)), [mods]);

  /** Everything on one date: timetable classes (with any change), classes I cover, extra classes. */
  const itemsOn = (i) => {
    const date = addDays(monday, i);
    const ofDay = changes.filter((c) => c.date === date);
    const bySlot = new Map(ofDay.filter((c) => c.slotId).map((c) => [c.slotId, c]));
    const fromChange = (c, kind) => ({
      kind, key: c.id, id: c.slotId || c.id, date, start: c.start, end: c.end, module: c.module, room: c.room,
      type: c.sessionType, group: c.group, change: c, session: c.session, teaches: myModules.has(c.module.id),
    });
    const items = (list || []).filter((x) => x.dayOfWeek === i + 1).map((x) => ({ ...x, kind: 'slot', key: x.id, date, change: bySlot.get(x.id) || null }));
    if (teacher) {
      ofDay.filter((c) => c.type === 'cover' && c.coverTutor?.id === myId && !items.some((x) => x.id === c.slotId))
        .forEach((c) => items.push(fromChange(c, 'cover')));
    }
    ofDay.filter((c) => c.type === 'extra').forEach((c) => items.push(fromChange(c, 'extra')));
    return items.sort((a, b) => a.start.localeCompare(b.start));
  };

  if (!list) return <p className="tt-empty">Loading timetable…</p>;

  // Sunday has no timetable classes, so its tab only shows when it is today or has an extra class
  const showSun = (monday === thisMonday && todayIdx === 6) || itemsOn(6).length > 0;
  const days = showSun ? [...DAYS, 'Sunday'] : DAYS;
  if (day === 6 && !showSun) { setDay(0); return null; }
  const date = addDays(monday, day);
  const isToday = date === today;
  const classes = itemsOn(day);
  const cancelled = (x) => x.change?.type === 'cancelled';
  // No tutor assigned to the module this semester: the class doesn't happen and its room is free
  const unassigned = (x) => x.kind === 'slot' && x.assigned === false;
  const off = (x) => cancelled(x) || unassigned(x);
  const next = isToday ? classes.find((x) => x.start > now && !off(x)) : null;
  const count = (i) => itemsOn(i).filter((x) => !off(x)).length;
  const over = (x) => x.date < today || (x.date === today && x.end <= now);
  const open = (x) => x.date === today && mins(now) >= mins(x.start) - EARLY && now < x.end;

  const done = (text) => () => { setDialog(null); setMsg(text); setReload((n) => n + 1); };
  const goWeek = (n) => {
    setMsg('');
    if (n === 0) { setMonday(thisMonday); setDay(todayIdx); } else setMonday(addDays(monday, 7 * n));
  };
  const weekName = monday === thisMonday ? 'This week' : monday === addDays(thisMonday, 7) ? 'Next week' : monday === addDays(thisMonday, -7) ? 'Last week' : 'Week of';
  const weekLabel = `${short(monday, { day: 'numeric', month: 'short' })} – ${short(addDays(monday, showSun ? 6 : 5), { day: 'numeric', month: 'short' })}`;

  /** The right-hand side of a tutor's card. */
  const tutorActions = (x) => {
    if (unassigned(x)) return [];
    const c = x.change, se = x.session;
    const iCover = c?.type === 'cover' && c.coverTutor?.id === myId;
    const mine = x.kind === 'extra' ? x.teaches : x.teaches && !iCover;
    const startPath = x.kind === 'slot' && !c ? '/start?slot=' + x.id : c && c.type !== 'cancelled' ? '/start?change=' + c.id : null;
    const canStart = !cancelled(x) && (x.kind === 'slot' ? x.teaches && (!c || iCover) : x.kind === 'cover' || x.teaches);

    const out = [];
    if (se) {
      out.push(<span key="s" className={'pill ' + (se.status === 'ended' ? 'ok' : 'b')}>{se.status === 'ended' ? 'Attendance taken' : 'Attendance open'}</span>);
    } else if (canStart && startPath && open(x)) {
      out.push(<button key="s" className="pbtn" onClick={() => nav(startPath)}>Start attendance</button>);
    } else if (canStart && !over(x) && x.date === today) {
      out.push(<small key="s" className="mut">Opens at {hm(Math.max(0, mins(x.start) - EARLY))}</small>);
    }
    if (x.kind === 'slot' && !x.teaches && !iCover) out.push(<small key="n" className="mut">Not assigned to you</small>);

    // ⋯ menu: cancel / cover a timetable class, or undo a change
    const canChange = mine && !se && !over(x);
    const items = [];
    if (canChange && x.kind === 'slot' && !c) {
      items.push(['Cancel this class', () => setDialog({ kind: 'cancel', item: x })]);
      items.push(['Ask someone to cover', () => setDialog({ kind: 'cover', item: x })]);
    }
    if (canChange && c) {
      items.push([{ cancelled: 'Undo cancellation', cover: 'Take the class back', extra: 'Call off this class' }[c.type], () => setDialog({ kind: 'undo', change: c })]);
    }
    if (items.length) {
      out.push(
        <span key="m" className="tt-menu">
          <button className="tt-dots" aria-label="Class options" aria-haspopup="menu" aria-expanded={menu === x.key} onClick={() => setMenu(menu === x.key ? null : x.key)}>⋯</button>
          {menu === x.key && (
            <span className="tt-pop" role="menu">
              {items.map(([label, fn]) => (
                <button key={label} role="menuitem" onClick={() => { setMenu(null); setMsg(''); fn(); }}>{label}</button>
              ))}
            </span>
          )}
        </span>
      );
    }
    return out;
  };

  const studentActions = (x) => {
    const se = x.session;
    if (off(x)) return null;
    if (se?.myStatus) return <span className={'pill ' + (ATT[se.myStatus] || 'b')}>{se.myStatus}</span>;
    if (se?.status === 'ongoing') return <button className="pbtn" onClick={() => nav('/attendance')}>Check in</button>;
    if (x.kind === 'slot' && x.enrolled === false) return <small className="mut">Not enrolled</small>;
    return null;
  };

  /** One line explaining a change. */
  const changeInfo = (x) => {
    const c = x.change;
    if (!c) return null;
    if (c.type === 'cancelled') return <small className="tt-why red">{c.reason}{teacher ? '' : '. You won\'t be marked absent.'}</small>;
    if (c.type === 'cover') {
      const iCover = c.coverTutor?.id === myId;
      return <small className="tt-why">{iCover ? `You're covering for ${c.by?.name || 'another tutor'}` : `Taken by ${c.coverTutor?.name || 'another tutor'}`} · {c.reason}</small>;
    }
    return <small className="tt-why">{c.counts ? 'Counts toward attendance' : 'Attendance is taken but doesn\'t count toward anyone\'s %'} · {c.reason}</small>;
  };

  return (
    <div className="tt">
      <div className="tt-head">
        <p className="tt-date">
          {short(today, { weekday: 'long', day: 'numeric', month: 'long' })}{term ? ` · ${term.name}` : ''}
        </p>
        {teacher && mods.length > 0 && (
          <button className="tt-add" onClick={() => { setMsg(''); setDialog({ kind: 'extra' }); }}>+ Extra class</button>
        )}
      </div>

      <div className="tt-week">
        <button className="tt-wk" onClick={() => goWeek(-1)} aria-label="Previous week">‹</button>
        <span><b>{weekName}</b> {weekLabel}</span>
        <button className="tt-wk" onClick={() => goWeek(1)} aria-label="Next week">›</button>
        {monday !== thisMonday && <button className="tt-link" onClick={() => goWeek(0)}>Back to this week</button>}
      </div>

      <div className="tt-days" role="tablist">
        {days.map((d, i) => {
          const ds = addDays(monday, i);
          return (
            <button key={d} role="tab" aria-selected={day === i} className={'tt-day' + (day === i ? ' on' : '')} onClick={() => setDay(i)}>
              {ds === today ? 'Today' : d.slice(0, 3)}
              <span>{short(ds, { day: 'numeric', month: 'short' })}</span>
              <small>{count(i) || '–'}</small>
            </button>
          );
        })}
      </div>

      <h3 className="tt-h">
        {isToday ? "Today's classes" : short(date, { weekday: 'long', day: 'numeric', month: 'short' })}{' '}
        <span>{count(day)} {count(day) === 1 ? 'class' : 'classes'}</span>
      </h3>

      {err && <p className="err">{err}</p>}
      {msg && <p className="tt-ok" role="status">✓ {msg}</p>}

      {classes.length === 0 ? (
        <div className="tt-empty">
          {list.length === 0 && !changes.length
            ? teacher
              ? 'No classes yet. Once the admin assigns you a module that is on the timetable, its classes appear here.'
              : 'No classes yet. Set your programme and year in your profile, or enrol in a module.'
            : isToday ? 'No classes today.' : `No classes on ${DAYS[day]}.`}
        </div>
      ) : (
        <div className="tt-list">
          {classes.map((x) => {
            const live = isToday && x.start <= now && now < x.end && !off(x);
            const c = x.change;
            const cls = ['tt-card', live && 'live', over(x) && 'done', off(x) && 'off', unassigned(x) && 'na', x.kind === 'extra' && 'extra', c?.type === 'cover' && 'cover'].filter(Boolean).join(' ');
            return (
              <div key={x.key} className={cls}>
                <div className="tt-time">
                  <b>{x.start}</b>
                  <small>{x.end}</small>
                </div>

                <div className="tt-body">
                  <div className="tt-tags">
                    {live && <span className="pill b">Now</span>}
                    {next && next.key === x.key && <span className="pill o">Next</span>}
                    {cancelled(x) && <span className="pill red">Cancelled</span>}
                    {unassigned(x) && <span className="pill gr">Module not assigned</span>}
                    {c?.type === 'cover' && <span className="pill v">Cover</span>}
                    {x.kind === 'extra' && <span className={'pill ' + (c.counts ? 'g' : 'gr')}>{c.counts ? 'Extra class' : 'Optional'}</span>}
                    <span className={'tt-type ' + x.type}>{TYPE[x.type] || x.type}</span>
                    {x.group && <span className="tt-grp">Group {x.group}</span>}
                  </div>
                  <b className="tt-mod">{x.module.code} · {x.module.name}</b>
                  <small className="mut">
                    {x.room ? `Room ${x.room.name}${unassigned(x) ? ' (free to book)' : ''}` : 'Room not set'}
                    {x.kind === 'slot' && x.tutors && !c && !unassigned(x) ? ` · ${x.tutors}` : ''}
                    {!teacher && x.year ? ` · Year ${x.year}` : ''}
                  </small>
                  {unassigned(x) ? <small className="tt-why">No tutor is assigned to this module yet, so this class doesn't run.</small> : changeInfo(x)}
                  {x.session?.takenBy && c?.type !== 'cover' && <small className="mut">Taken by {x.session.takenBy}</small>}
                </div>

                <div className="tt-act">{teacher ? tutorActions(x) : studentActions(x)}</div>
              </div>
            );
          })}
        </div>
      )}

      {teacher && (
        <p className="tt-foot">
          You can start attendance from {EARLY} minutes before a class until it ends. To teach at another time, book an extra class.
        </p>
      )}

      {dialog?.kind === 'cancel' && <CancelDialog item={dialog.item} onClose={() => setDialog(null)} onDone={done('Class cancelled. Students have been told.')} />}
      {dialog?.kind === 'cover' && <CoverDialog item={dialog.item} onClose={() => setDialog(null)} onDone={done('Cover saved. The tutor and students have been told.')} />}
      {dialog?.kind === 'undo' && <UndoDialog change={dialog.change} onClose={() => setDialog(null)} onDone={done('Done. Everyone affected has been told.')} />}
      {dialog?.kind === 'extra' && (
        <ExtraDialog
          mods={mods} today={today} module={dialog.module}
          date={date >= today ? date : today}
          onClose={() => setDialog(null)}
          onDone={(c) => {
            setMonday(mondayOf(c.date));
            setDay(Math.min((new Date(c.date + 'T00:00:00Z').getUTCDay() || 7) - 1, 5));
            done('Class booked. Students have been told.')();
          }}
        />
      )}
    </div>
  );
}
