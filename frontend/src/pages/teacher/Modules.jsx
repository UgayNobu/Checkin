import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import './staff.css';
const dt = (d) => new Date(d).toLocaleDateString('en', { day: 'numeric', month: 'numeric', year: 'numeric' });

// VLE-style course card image: a pattern whose colour comes from the module code (like Moodle's course images)
const HUES = ['#0f6cbf', '#357a32', '#7a3a99', '#a35d00', '#1b7f8c', '#b0372c', '#3a5aa8', '#5b6b2a'];
export function pattern(code = '') {
  let h = 0; for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const bg = HUES[h % HUES.length], r = (n) => ((h >> n) % 40) + 20;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120"><rect width="240" height="120" fill="${bg}"/>` +
    `<g fill="#fff" fill-opacity=".12"><circle cx="${r(1)}" cy="${r(3)}" r="${r(5) + 20}"/><circle cx="${200 - r(2)}" cy="${90 - r(4) / 2}" r="${r(6) + 26}"/>` +
    `<rect x="${90 + r(7)}" y="${r(8) - 30}" width="70" height="70" transform="rotate(45 ${120 + r(7)} ${r(8)})"/></g>` +
    `<g fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2"><circle cx="${140 + r(9)}" cy="${60}" r="${r(10) + 12}"/><circle cx="${40 + r(11)}" cy="${100}" r="${r(12) + 8}"/></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function Modules({ to = '/modules', label = 'Enrolment key' }) {
  const nav = useNavigate(), [m, setM] = useState(null); useEffect(() => { api('/teacher/modules').then(setM).catch(() => setM([])); }, []);
  if (!m) return <p className="mut">Loading modules…</p>;
  if (!m.length) return <p className="mut">No modules yet. The admin assigns your modules for this semester.</p>;
  return (
    <div className="vcourses">
      <h3 className="vc-title">Module overview</h3>
      <div className="vc-grid">
        {m.map((x) => (
          <div className="vc-card" key={x.id} role="link" tabIndex={0} onClick={() => nav(`${to}/${x.id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`${to}/${x.id}`)}>
            <div className="vc-img" style={{ backgroundImage: pattern(x.code) }} aria-hidden="true" />
            <div className="vc-body">
              <small className="vc-cat">{x.code}{x.section ? ` · Section ${x.section}` : ''}</small>
              <a className="vc-name" href={`${to}/${x.id}`} onClick={(e) => e.preventDefault()}>{x.name}</a>
              <small className="vc-meta">{x.students} {x.students === 1 ? 'student' : 'students'}</small>
            </div>
            <div className="vc-foot">{label} →</div>
          </div>
        ))}
      </div>
    </div>
  );
}
export const RecordModules = () => <Modules to="/records" label="Details" />;

export function ModuleKey() {
  const nav = useNavigate();
  const { id } = useParams(), [key, setKey] = useState(''), [open, setOpen] = useState(true), [st, setSt] = useState([]), [msg, setMsg] = useState(''), [mod, setMod] = useState(null);
  const load = () => api(`/modules/${id}/students`).then(setSt);
  useEffect(() => { api('/teacher/modules').then((l) => { const m = l.find((y) => y.id === id); setMod(m || null); setKey(m?.enrolmentKey || ''); setOpen(m?.selfEnrol !== false); }); load(); }, [id]);
  const toggle = () => api(`/modules/${id}/key`, { selfEnrol: !open }, 'PUT').then((m) => { setOpen(m.selfEnrol); setMsg(m.selfEnrol ? 'Self-enrolment opened' : 'Self-enrolment closed'); }).catch((e) => setMsg(e.message));
  const save = (e) => { e.preventDefault(); api(`/modules/${id}/key`, { key }, 'PUT').then(() => setMsg('Changes saved')).catch((x) => setMsg(x.message)); };
  const remove = (x) => { if (window.confirm(`Remove ${x.student.name} (${x.student.userId}) from this module?`)) api(`/modules/${id}/students/${x.student.userId}`, null, 'DELETE').then(load).catch((e) => setMsg(e.message)); };
  const add = () => { const u = prompt('Student ID'); if (u) api(`/modules/${id}/students`, { userId: u }).then(load).catch((e) => setMsg(e.message)); };
  return (
    <div className="vkey">
      <button className="vk-back" onClick={() => nav('/modules')}>← My Modules</button>
      {mod && <h2 className="vk-title">{mod.code} · {mod.name}</h2>}

      <section className="vk-box">
        <h3>Self enrolment</h3>
        <form onSubmit={save}>
          <div className="vk-row">
            <label htmlFor="vk-key">Enrolment key</label>
            <div>
              <input id="vk-key" className="vk-input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. IDE202-AS26" />
              <small>Students type this key once to join the module.</small>
            </div>
          </div>
          <div className="vk-row">
            <span className="vk-label">Allow self enrolment</span>
            <label className="vk-check"><input type="checkbox" checked={open} onChange={toggle} /> Students can join with the key</label>
          </div>
          <div className="vk-row">
            <span />
            <div className="vk-actions">
              <button className="pbtn" type="submit">Save changes</button>
              {msg && <span className="vk-msg" role="status">{msg}</span>}
            </div>
          </div>
        </form>
      </section>

      <section className="vk-box">
        <div className="vk-head">
          <h3>Enrolled students <span className="mut">({st.length})</span></h3>
          <button className="ghost" onClick={add}>Enrol student</button>
        </div>
        <div className="tbl"><table><thead><tr><th>Student number</th><th>Name</th><th>Enrolled on</th><th></th></tr></thead>
          <tbody>{st.length ? st.map((x, i) => <tr key={i}><td>{x.student.userId}</td><td>{x.student.name}</td><td>{dt(x.date)}</td><td className="vk-right"><button className="vk-remove" onClick={() => remove(x)}>Remove</button></td></tr>)
            : <tr><td colSpan={4} className="mut">No students enrolled yet.</td></tr>}</tbody></table></div>
      </section>
    </div>
  );
}
