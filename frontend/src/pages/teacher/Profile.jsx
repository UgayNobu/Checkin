import { useEffect, useState } from 'react';
import { api } from '../../api';
import './profile.css';
const ini = (n = '') => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export function Profile() {
  const [me, setMe] = useState(null), [mods, setMods] = useState([]), [msg, setMsg] = useState('');
  useEffect(() => { api('/me').then(setMe); api('/teacher/modules').then(setMods); }, []);
  if (!me) return null; const set = (k) => (e) => setMe({ ...me, [k]: e.target.value });
  const joined = new Date(me.createdAt).toLocaleDateString('en', { month: 'long', year: 'numeric' });
  const f = (l, v, k) => <div className="fld"><small>{l}</small><input value={v || ''} readOnly={!k} onChange={k ? set(k) : undefined} /></div>;
  return (
    <div className="prof"><div className="pcard"><div className="bigav">{ini(me.name)}</div><b>{me.name}</b><small>{me.designation} · Dept. of {me.department}</small>
      <button className="ghost">Change Photo</button><div className="kv"><small>Employee ID</small><b>{me.userId}</b></div><div className="kv"><small>Joined</small><b>{joined}</b></div></div>
      <div className="pform"><div className="g2">{f('Full Name', me.name, 'name')}{f('Employee ID', me.userId)}{f('Email', me.email, 'email')}{f('Phone', me.phone, 'phone')}
        {f('Department', me.department)}{f('Designation', me.designation)}{f('Modules Assigned', mods.map((m) => m.code).join(', '))}{f('Joined', joined)}</div>
        <button className="pbtn" onClick={() => api('/me', { name: me.name, email: me.email, phone: me.phone }, 'PUT').then(() => setMsg('Saved'))}>Save Changes</button>
        <span className="ok">{msg}</span></div></div>);
}

export function TeacherSettings() {
  const [me, setMe] = useState(null), [tab, setTab] = useState('n'), [pw, setPw] = useState({ current: '', next: '' }), [msg, setMsg] = useState('');
  useEffect(() => { api('/me').then(setMe); }, []);
  if (!me) return null; const prefs = me.prefs || {};
  const tog = (k) => { const p = { ...prefs, [k]: !prefs[k] }; setMe({ ...me, prefs: p }); api('/me', { prefs: p }, 'PUT'); };
  const rows = [['email', 'Email notifications', 'Get emailed when a relief request is approved or declined.'], ['sms', 'SMS alerts', 'Receive a text message when a check-in code is about to expire.'], ['push', 'Push notifications', 'Show alerts on this device for new relief requests.']];
  return (
    <div className="setbox"><div className="tabs"><button className={tab === 'n' ? 'on' : ''} onClick={() => setTab('n')}>Notification Settings</button><button className={tab === 'a' ? 'on' : ''} onClick={() => setTab('a')}>Account</button></div>
      {tab === 'n' ? rows.map(([k, t, s]) => <div className="srow" key={k}><div><b>{t}</b><small>{s}</small></div><button className={'sw ' + (prefs[k] ? 'on' : '')} onClick={() => tog(k)} /></div>) :
        <div style={{ maxWidth: 340 }}><label>Current password</label><input type="password" onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          <label>New password</label><input type="password" onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          <button className="pbtn" style={{ marginTop: 14 }} onClick={() => api('/me/password', pw, 'PUT').then((r) => setMsg(r.message)).catch((e) => setMsg(e.message))}>Update password</button><p className="ok">{msg}</p></div>}
    </div>);
}
