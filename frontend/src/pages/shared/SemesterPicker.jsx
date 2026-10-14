// Semester picker for history pages (attendance records, management history).
// The choice lives in the URL (?session=AS2026), so it carries over when you
// click into a module or a student. Empty = the current semester.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';

/** { session, setSession, qs } — qs is '' or '?session=AS2026' to add to API calls and links. */
export function useSemester() {
  const [params, setParams] = useSearchParams();
  const session = params.get('session') || '';
  const setSession = (code) => {
    const next = new URLSearchParams(params);
    if (code) next.set('session', code);
    else next.delete('session');
    setParams(next, { replace: true });
  };
  return { session, setSession, qs: session ? `?session=${session}` : '' };
}

export default function SemesterPicker({ session, setSession }) {
  const [list, setList] = useState([]);

  useEffect(() => {
    api('/academic-sessions').then((r) => setList(Array.isArray(r) ? r : [])).catch(() => setList([]));
  }, []);

  // Only worth showing once there is more than one semester
  if (list.length < 2) return null;
  const current = list.find((x) => x.isCurrent);

  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, margin: '0 0 12px' }}>
      <span style={{ color: 'var(--muted)' }}>Semester</span>
      <select
        value={session}
        onChange={(e) => setSession(e.target.value)}
        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #d6dbe6', font: 'inherit', fontSize: 12 }}
      >
        <option value="">{current ? `${current.name} (current)` : 'Current semester'}</option>
        {list.filter((x) => !x.isCurrent).map((x) => (
          <option key={x.code} value={x.code}>{x.name}</option>
        ))}
      </select>
    </label>
  );
}
