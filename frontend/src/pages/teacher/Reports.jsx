import { useEffect, useState } from 'react';
import { api } from '../../api';
import './reports.css';
const C = ['#059669', '#2f6df0', '#f59e0b'];
export default function Reports() {
  const [d, setD] = useState([]); useEffect(() => { api('/teacher/reports').then(setD); }, []);
  return (
    <div className="rep"><div className="rtop2">
      <div className="rbox"><h4>Weekly Attendance by Module</h4>
        <div className="leg">{d.map((m, i) => <span key={m.code}><i style={{ background: C[i % 3] }} />{m.code} – {m.name}</span>)}</div>
        <div className="wk">{[0, 1, 2, 3, 4, 5].map((w) => <div className="wg" key={w}><div className="bs">{d.map((m, i) => <div key={m.code} className="b" style={{ height: m.weeks[w] * 1.6, background: C[i % 3] }} />)}</div><small>Wk{w + 1}</small></div>)}</div></div>
      <div className="rbox sm"><h4>Overall Attendance</h4>
        <div className="rings">{d.map((m, i) => <div key={m.code}><div className="ring" style={{ '--c': C[i % 3], '--p': m.overall }}><b>{m.overall}%</b></div>{m.code}</div>)}</div></div></div>
      <div className="rbox"><h4>Module Performance</h4>
        {d.map((m, i) => <div className="perf" key={m.code}><span>{m.code} – {m.name}</span><div className="track"><div style={{ width: m.overall + '%', background: C[i % 3] }} /></div><b>{m.overall}%</b></div>)}</div></div>);
}
