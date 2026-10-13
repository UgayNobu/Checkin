import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import './admin.css';

const E = encodeURIComponent, R = ['I', 'II', 'III', 'IV'];

const Back = ({ label = '< Back' }) => {
  const nav = useNavigate();
  return <button className="back" onClick={() => nav(-1)}>{label}</button>;
};

/* =========================================================
   OVERVIEW
   ========================================================= */
export function Overview() {
  const nav = useNavigate(), [o, setO] = useState({}), [p, setP] = useState([]);
  useEffect(() => {
    api('/admin/overview').then(setO).catch(console.error);
    api('/admin/programs').then(setP).catch(console.error);
  }, []);

  const pick = (base) => (
    <select className="prog" defaultValue="" onChange={(e) => e.target.value && nav(`/${base}/${E(e.target.value)}`)}>
      <option value="">PROGRAM</option>
      {p.map((x) => <option key={x}>{x}</option>)}
    </select>
  );

  return (
    <div className="adm">
      <h2 className="ttl">Admin <small>Overview</small></h2>
      <div className="stats">
        {[
          ['Total Students', o.students, `↑ ${o.newStudents || 0} this month`],
          ['Total Tutors', o.tutors, 'Active faculty'],
          ['Total Programs', o.programs]
        ].map(([l, v, c]) => (
          <div className="stat" key={l}>
            <small>{l}</small>
            <b>{(v || 0).toLocaleString()}</b>
            {c && <span className="pill ok">{c}</span>}
          </div>
        ))}
      </div>
      <h4>Students view</h4>
      {pick('students')}
      <h4 style={{ marginTop: 90 }}>Tutors view</h4>
      {pick('teachers')}
    </div>
  );
}

/* =========================================================
   YEARS
   ========================================================= */
export function Years() {
  const { program } = useParams(), nav = useNavigate();
  return (
    <div className="adm">
      <Back />
      <h2 className="ttl">BE ({program})</h2>
      <div className="plist">
        {R.map((r, i) => (
          <div className="prow" key={r} onClick={() => nav(`/students/${E(program)}/${i + 1}`)}>
            Year {r}
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================================================
   PEOPLE
   ========================================================= */
function People({ role }) {
  const { program, year } = useParams(), [u, setU] = useState([]), stu = role === 'student';
  const load = () => api(`/admin/users?role=${role}&department=${E(program)}${stu ? '&year=' + year : ''}`).then(setU).catch(console.error);
  useEffect(() => { load(); }, [program, year]);
  const patch = (x, b) => api('/admin/users/' + x._id, b, 'PATCH').then(load);

  return (
    <div className="adm">
      <Back />
      <h2 className="ttl">{stu ? `BE (${program})` : 'Admin'} <small>{stu ? `Year ${R[year - 1]}` : 'Teacher'}</small></h2>
      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>NAME</th><th>ID</th><th>PROGRAM</th>{stu && <th>ATTENDANCE</th>}<th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {u.map((x) => (
              <tr key={x._id} style={{ opacity: x.active ? 1 : .5 }}>
                <td><b>{x.name}</b></td>
                <td>{x.userId}</td>
                <td>{x.department}</td>
                {stu && <td>{x.pct}%</td>}
                <td>
                  <button className="eb" onClick={() => { const n = window.prompt('Name', x.name); if (n) patch(x, { name: n }); }}>Edit</button>
                  <button className="ab" onClick={() => patch(x, { active: !x.active })}>{x.active ? 'Deactivate' : 'Activate'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export const Students = () => <People role="student" />;
export const Teachers = () => <People role="teacher" />;

/* =========================================================
   PROGRAMS (Add / Rename / Delete — all without popup)
   ========================================================= */
export function Programs() {
  const nav = useNavigate();
  const [p, setP] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newProg, setNewProg] = useState('');
  const [editProg, setEditProg] = useState({ old: '', new: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const load = () => {
    setLoading(true);
    api('/admin/programs')
      .then((data) => {
        setP(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Load error:', err);
        setError('Failed to load programs.');
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  // Reload the whole SPA so every other interface picks up the change
  const refreshAll = (msg) => {
    setSuccess(msg);
    setEditProg({ old: '', new: '' });
    load();
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  const addProgram = () => {
    if (!newProg.trim()) return;
    setIsAdding(true);
    setError('');
    setSuccess('');

    api('/admin/programs', { name: newProg.trim() }, 'POST')
      .then(() => {
        setNewProg('');
        refreshAll(`"${newProg}" added successfully!`);
      })
      .catch((err) => {
        console.error('Add error:', err);
        setError(err.message || 'Failed to add program.');
      })
      .finally(() => setIsAdding(false));
  };

  // --- RENAME (saves immediately, no popup) ---
  const saveEdit = () => {
    if (!editProg.new.trim() || editProg.new === editProg.old) {
      setEditProg({ old: '', new: '' });
      return;
    }
    setError('');
    setSuccess('');
    api('/admin/programs', { from: editProg.old, to: editProg.new.trim() }, 'PUT')
      .then(() => {
        refreshAll(`Renamed to "${editProg.new.trim()}"`);
      })
      .catch((err) => setError(err.message || 'Failed to rename program.'));
  };

  // --- DELETE (deletes immediately, no popup) ---
  const deleteProgram = (name) => {
    setError('');
    setSuccess('');
    api('/admin/programs', { name }, 'DELETE')
      .then(() => {
        refreshAll(`"${name}" deleted.`);
      })
      .catch((err) => setError(err.message || 'Failed to delete program.'));
  };

  return (
    <div className="adm">
      <h2 className="ttl">Programs & Modules <small>Structure</small></h2>

      <div className="pbox">
        <h4 className="pbox-title">📘 Programs</h4>

        {/* Add New Program Bar */}
        <div className="add-row">
          <input
            placeholder="Enter new program name..."
            value={newProg}
            onChange={(e) => setNewProg(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addProgram()}
            disabled={isAdding}
          />
          <button className="btn-add" onClick={addProgram} disabled={isAdding}>
            {isAdding ? 'Adding...' : '+ Add New Program'}
          </button>
        </div>

        {error && <p className="err" style={{ textAlign: 'left', marginTop: 12, padding: 10, background: '#fef2f2', borderRadius: 6 }}>⚠️ {error}</p>}
        {success && <p style={{ textAlign: 'left', marginTop: 12, padding: 10, background: '#d1fae5', color: '#047857', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>✓ {success}</p>}

        {/* Program List */}
        {loading ? (
          <p className="mut" style={{ marginTop: 16 }}>Loading programs...</p>
        ) : p.length === 0 ? (
          <p className="mut" style={{ marginTop: 16 }}>No programs yet. Add one above.</p>
        ) : (
          <div style={{ marginTop: 16 }}>
            {p.map((x) => (
              <div className="prow2" key={x}>
                {editProg.old === x ? (
                  <div className="edit-row">
                    <input
                      value={editProg.new}
                      onChange={(e) => setEditProg({ ...editProg, new: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                      autoFocus
                    />
                    <button className="eb save" onClick={saveEdit}>Save</button>
                    <button className="eb delete" onClick={() => deleteProgram(x)}>Delete</button>
                    <button className="eb" onClick={() => setEditProg({ old: '', new: '' })}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <b onClick={() => nav('/programs/' + E(x))}>{x}</b>
                    <button className="eb" onClick={() => setEditProg({ old: x, new: x })}>Edit</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   PROGRAM YEARS
   ========================================================= */
export function ProgramYears() {
  const { program } = useParams(), nav = useNavigate(), [open, setOpen] = useState(0);
  return (
    <div className="adm">
      <Back />
      <h2 className="ttl">BE ({program})</h2>
      <div className="plist">
        {R.map((r, i) => (
          <div key={r} className="year-group">
            <div className="prow" onClick={() => setOpen(open === i + 1 ? 0 : i + 1)}>Year {r}</div>
            {open === i + 1 && (
              <div className="sem-list">
                {[1, 2].map((s) => (
                  <div className="sem" key={s}>
                    <span>Semester {R[s - 1]}</span>
                    <button className="eb" onClick={() => nav(`/programs/${E(program)}/${i + 1}/${s}`)}>Manage Modules</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================================================
   SEMESTER MODULES
   ========================================================= */
export function SemesterModules() {
  const { program, year, semester } = useParams(), nav = useNavigate();
  const [m, setM] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api(`/admin/modules?department=${E(program)}&year=${year}&semester=${semester}`)
      .then((data) => {
        setM(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError('Failed to load modules.');
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, [program, year, semester]);

  const go = (id) => nav(`/programs/${E(program)}/${year}/${semester}/module/${id}`);
  const filtered = m.filter((x) => (x.code + x.name).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="adm">
      <button className="topbtn" onClick={() => nav(-1)}>Back</button>
      <div className="search">
        <input placeholder="🔍 Search modules..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="tabx">Year {R[year - 1]} : Semester {R[semester - 1]}</div>

      <div className="pbox">
        <h4 className="pbox-title">📘 Modules</h4>
        {error && <p className="err" style={{ textAlign: 'left', marginBottom: 12 }}>⚠️ {error}</p>}

        {loading ? (
          <p className="mut">Loading modules...</p>
        ) : filtered.length === 0 ? (
          <p className="mut">No modules yet. Click below to add one.</p>
        ) : (
          filtered.map((x) => (
            <div className="mod" key={x._id} onClick={() => go(x._id)}>
              <b>{x.code}</b> - {x.name}
            </div>
          ))
        )}
        <button className="btn-add" onClick={() => go('new')}>+ Add New Module</button>
      </div>
    </div>
  );
}

/* =========================================================
   MODULE FORM
   ========================================================= */
export function ModuleForm() {
  const { program, year, semester, id } = useParams(), nav = useNavigate();
  const [f, setF] = useState({ name: '', code: '', tutorId: '', count: '' });
  const [t, setT] = useState([]);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/admin/users?role=teacher').then((data) => setT(Array.isArray(data) ? data : [])).catch(() => {});
    if (id !== 'new') {
      api(`/admin/modules?department=${E(program)}&year=${year}&semester=${semester}`)
        .then((l) => {
          const x = l.find((y) => y._id === id);
          if (x) setF({ name: x.name, code: x.code, tutorId: x.tutor?.userId || '', count: x.count || '' });
        })
        .catch((err) => console.error(err));
    }
  }, [id, program, year, semester]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const tn = t.find((x) => x.userId === f.tutorId)?.name || '';

  const save = () => {
    if (!f.name.trim() || !f.code.trim()) return setErr('Name and Code are required');
    setSaving(true);
    setErr('');

    api(
      id === 'new' ? '/admin/modules' : '/admin/modules/' + id,
      { ...f, department: program, year, semester },
      id === 'new' ? 'POST' : 'PUT'
    )
      .then(() => nav(-1))
      .catch((e) => {
        console.error('Save error:', e);
        setErr(e.message || 'Failed to save.');
        setSaving(false);
      });
  };

  const inp = (l, k, ro) => (
    <div className="form-group">
      <label>{l}</label>
      <input
        value={ro ? tn : f[k]}
        readOnly={!!ro}
        onChange={ro ? undefined : set(k)}
        placeholder={ro ? '' : `Enter ${l.toLowerCase()}...`}
      />
    </div>
  );

  return (
    <div className="adm">
      <button className="topbtn" onClick={() => nav(-1)}>Back</button>
      <div className="mform">
        <h3>{id === 'new' ? '+ Add New Module' : 'Edit Module'}</h3>
        {inp('Module Name', 'name')}
        {inp('Module Code', 'code')}
        {inp('Assign Tutor (Staff ID)', 'tutorId')}
        {inp('Teacher Name', 'x', true)}
        {inp('Credits / Count', 'count')}
        {err && <p className="err" style={{ marginTop: 12 }}>⚠️ {err}</p>}
        <button className="save-btn" onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save Module'}
        </button>
      </div>
    </div>
  );
}