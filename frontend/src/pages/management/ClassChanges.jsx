// Management: every change to the timetable, week by week (backend: classChange.service.js).
// Tutors make these changes themselves; nothing here needs approving.
//  • Cancelled   – a timetable class not held that day (students are not marked absent)
//  • Cover       – another tutor took the class
//  • Extra       – a class outside the timetable that counts toward attendance
//  • Optional    – a free / revision class: attendance is taken but never counts
//  • Not recorded – a timetable class of an assigned module with no attendance and no change
import { useEffect, useState } from 'react';
import { api } from '../../api';
import './classchanges.css';

const bhutanToday = () => new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (s, n) => new Date(new Date(s + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
const mondayOf = (s) => addDays(s, -((new Date(s + 'T00:00:00Z').getUTCDay() || 7) - 1));
const fmt = (s, o) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', ...o });
const day = (s) => fmt(s, { weekday: 'short', day: 'numeric', month: 'short' });

const TABS = [
  ['all', 'All changes'],
  ['cancelled', 'Cancelled'],
  ['cover', 'Covers'],
  ['extra', 'Extra'],
  ['optional', 'Optional'],
  ['notRecorded', 'Not recorded'],
];
const kindOf = (c) => (c.type === 'extra' && !c.counts ? 'optional' : c.type);
const LABEL = { cancelled: 'Cancelled', cover: 'Cover', extra: 'Extra class', optional: 'Optional' };

export default function ClassChanges() {
  const thisMonday = mondayOf(bhutanToday());
  const [monday, setMonday] = useState(thisMonday);
  const [tab, setTab] = useState('all');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setData(null);
    setErr('');
    api(`/management/class-changes?from=${monday}&to=${addDays(monday, 6)}`)
      .then(setData)
      .catch((e) => { setErr(e.message); setData({ changes: [], notRecorded: [], summary: {} }); });
  }, [monday]);

  const s = data?.summary || {};
  const count = { all: data?.changes.length, cancelled: s.cancelled, cover: s.cover, extra: s.extra, optional: s.optional, notRecorded: s.notRecorded };
  const rows = !data ? [] : tab === 'all' ? data.changes : data.changes.filter((c) => kindOf(c) === tab);
  const label = `${fmt(monday, { day: 'numeric', month: 'short' })} – ${fmt(addDays(monday, 6), { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div className="ccm">
      <p className="ccm-note">
        Tutors cancel classes, ask another tutor to cover, and book extra classes themselves. Everything is listed here.
        Optional classes record who came but never count toward anyone's attendance.
      </p>

      <div className="ccm-week">
        <button onClick={() => setMonday(addDays(monday, -7))} aria-label="Previous week">‹</button>
        <b>{monday === thisMonday ? 'This week' : 'Week'}</b> <span>{label}</span>
        <button onClick={() => setMonday(addDays(monday, 7))} aria-label="Next week">›</button>
        {monday !== thisMonday && <button className="ccm-link" onClick={() => setMonday(thisMonday)}>This week</button>}
      </div>

      <div className="ccm-tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l} <small>{data ? count[k] ?? 0 : '…'}</small>
          </button>
        ))}
      </div>

      {err && <p className="err">{err}</p>}
      {!data ? (
        <p className="ccm-empty">Loading…</p>
      ) : tab === 'notRecorded' ? (
        <>
          <p className="ccm-help">
            Timetable classes of modules with a tutor assigned, where no attendance was taken and the class wasn't cancelled.
          </p>
          <div className="ccm-tbl">
            <table>
              <thead><tr><th>Date</th><th>Time</th><th>Module</th><th>Class</th><th>Tutor</th><th>Room</th></tr></thead>
              <tbody>
                {data.notRecorded.length === 0 && <tr><td colSpan={6} className="ccm-empty">Every class this week was taken or cancelled.</td></tr>}
                {data.notRecorded.map((n) => (
                  <tr key={n.slotId + n.date}>
                    <td>{day(n.date)}</td>
                    <td>{n.start}–{n.end}</td>
                    <td><b>{n.module.code}</b> <span className="ccm-mut">{n.module.name}</span></td>
                    <td>{n.cohort}{n.group ? ` · Group ${n.group}` : ''}</td>
                    <td>{n.tutors || '–'}</td>
                    <td>{n.room?.name || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="ccm-tbl">
          <table>
            <thead><tr><th>Date</th><th>Time</th><th>Module</th><th>Change</th><th>Details</th><th>By</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="ccm-empty">No {tab === 'all' ? 'changes' : TABS.find((t) => t[0] === tab)[1].toLowerCase()} this week.</td></tr>}
              {rows.map((c) => {
                const k = kindOf(c), se = c.session;
                return (
                  <tr key={c.id}>
                    <td>{day(c.date)}</td>
                    <td>{c.start}–{c.end}</td>
                    <td><b>{c.module.code}</b> <span className="ccm-mut">{c.module.name}</span>{c.room ? <span className="ccm-mut"> · {c.room.name}</span> : null}</td>
                    <td><span className={'ccm-pill ' + k}>{LABEL[k]}</span></td>
                    <td>
                      {c.reason}
                      {c.type === 'cover' && <div className="ccm-mut">Taken by {c.coverTutor?.name || '–'}</div>}
                      {c.type !== 'cancelled' && (
                        <div className="ccm-mut">
                          {se ? (se.status === 'ended' ? `${se.attended} attended` : 'Attendance open now') : c.date < bhutanToday() ? 'No attendance taken' : 'Not held yet'}
                        </div>
                      )}
                    </td>
                    <td>{c.by?.name || '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
