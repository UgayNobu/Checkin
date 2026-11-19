import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, fileHref } from '../../api';
import { toast } from '../../motion';
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

/** The card picture: the image the tutor set, or the coloured pattern */
export const coverOf = (m) => (m.coverUrl ? `url("${fileHref(m.coverUrl)}")` : pattern(m.code));

const COVER_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const COVER_MAX = 10 * 1024 * 1024;
/**
 * Crops a picture to the card's shape (2:1, from the middle) and makes it at most 1200×600,
 * so a big phone photo uploads quickly. Returns a JPEG Blob (or the original file if it can't be read).
 */
export async function fitCover(file) {
  try {
    const img = await new Promise((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i); i.onerror = bad;
      i.src = URL.createObjectURL(file);
    });
    const W = Math.min(1200, img.naturalWidth), H = Math.round(W / 2);
    const r = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const sw = W / r, sh = H / r, sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    URL.revokeObjectURL(img.src);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.86));
    return blob || file;
  } catch { return file; }
}

/** ⋮ menu on a module card: change or remove the cover image (the module's tutor only) */
function CoverMenu({ m, onChange }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const file = useRef(null);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('click', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!COVER_TYPES.includes(f.type)) return toast('Choose a PNG, JPG or WebP image', 'bad');
    if (f.size > COVER_MAX) return toast('That image is over 10 MB', 'bad');
    setBusy(true);
    const fd = new FormData();
    fd.append('file', await fitCover(f), 'cover.jpg');
    api(`/modules/${m.id}/cover`, fd)
      .then((r) => { onChange(r.coverUrl); toast(`New image for ${m.code}`); })
      .catch((x) => toast(x.message, 'bad'))
      .finally(() => setBusy(false));
  };
  const remove = () => {
    setOpen(false); setBusy(true);
    api(`/modules/${m.id}/cover`, null, 'DELETE')
      .then(() => { onChange(null); toast(`Image removed from ${m.code}`, 'info'); })
      .catch((x) => toast(x.message, 'bad'))
      .finally(() => setBusy(false));
  };
  // clicks inside the menu must not open the module
  return (
    <div className="vc-menu" ref={box} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button className={'vc-dots' + (busy ? ' busy' : '')} aria-label={`Options for ${m.code}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} disabled={busy}>
        {busy ? <i className="spin" /> : <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>}
      </button>
      {open && (
        <div className="vc-pop" role="menu">
          <button role="menuitem" onClick={() => { setOpen(false); file.current?.click(); }}>🖼️ {m.coverUrl ? 'Change image' : 'Add image'}</button>
          {m.coverUrl && <button role="menuitem" onClick={remove}>✕ Remove image</button>}
          <small>PNG, JPG or WebP, up to 10 MB. It is cropped to fit the card.</small>
        </div>
      )}
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick} />
    </div>
  );
}

export function Modules({ to = '/modules', label = 'Enrolment key', edit = to === '/modules' }) {
  const nav = useNavigate(), [m, setM] = useState(null); useEffect(() => { api('/teacher/modules').then(setM).catch(() => setM([])); }, []);
  const setCover = (id) => (url) => setM((l) => l.map((x) => (x.id === id ? { ...x, coverUrl: url } : x)));
  if (!m) return <p className="mut">Loading modules…</p>;
  if (!m.length) return <p className="mut">No modules yet. The admin assigns your modules for this semester.</p>;
  return (
    <div className="vcourses">
      <h3 className="vc-title">Module overview</h3>
      <div className="vc-grid">
        {m.map((x) => (
          <div className="vc-card" key={x.id} role="link" tabIndex={0} onClick={() => nav(`${to}/${x.id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`${to}/${x.id}`)}>
            <div className="vc-img" style={{ backgroundImage: coverOf(x) }} aria-hidden="true" />
            {edit && <CoverMenu m={x} onChange={setCover(x.id)} />}
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
