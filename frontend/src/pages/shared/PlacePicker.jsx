// PlacePicker: where a practical class happens. A text box that also offers a list:
// places this tutor used before come first, then the common campus places. Typing filters
// the list, and anything else can still be typed (the place stays optional).
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import './placepicker.css';

export const PLACES = [
  'EG Lab', 'Robotics Lab', 'Hydraulics Lab', 'Electrical Lab', 'Electronics Lab', 'Computer Lab (IT building)',
  'Mechanical Workshop', 'Civil Workshop', 'Architecture Studio', 'Survey Field', 'Football Ground',
  'Basketball Court', 'Campus Grounds', 'LH-01 (Lecture Hall)', 'Library',
];
const KEY = 'checkin_places';

/** Places this browser used recently (newest first, at most 5) */
export const recentPlaces = () => {
  try { return (JSON.parse(localStorage.getItem(KEY) || '[]') || []).filter((x) => typeof x === 'string').slice(0, 5); } catch { return []; }
};
/** Remember a place after a class is started or booked */
export const rememberPlace = (p) => {
  const v = String(p || '').trim();
  if (!v) return;
  try { localStorage.setItem(KEY, JSON.stringify([v, ...recentPlaces().filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 5))); } catch { /* private mode */ }
};

/** The list to show for what has been typed: recent first, then common places */
export function placeOptions(typed, recent = recentPlaces()) {
  const q = String(typed || '').trim().toLowerCase();
  const seen = new Set();
  const all = [...recent.map((p) => ({ p, recent: true })), ...PLACES.map((p) => ({ p, recent: false }))]
    .filter(({ p }) => (seen.has(p.toLowerCase()) ? false : seen.add(p.toLowerCase())));
  return q ? all.filter(({ p }) => p.toLowerCase().includes(q)) : all;
}

export default function PlacePicker({ id, value, onChange, disabled, placeholder = 'Choose or type a place', maxLength = 100 }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const box = useRef(null);
  const listId = useId();
  const recent = useMemo(() => recentPlaces(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // show everything when the box holds a place picked from the list; filter while typing
  const exact = PLACES.concat(recent).some((p) => p.toLowerCase() === String(value || '').toLowerCase());
  const opts = placeOptions(exact ? '' : value, recent);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  useEffect(() => setHi(-1), [value, open]);

  const choose = (p) => { onChange(p); setOpen(false); };
  const key = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(opts.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter' && open && hi >= 0) { e.preventDefault(); choose(opts[hi].p); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className={'pp' + (open ? ' open' : '')} ref={box}>
      <div className="pp-field">
        <span className="pp-pin" aria-hidden="true">📍</span>
        <input
          id={id} value={value} maxLength={maxLength} disabled={disabled} placeholder={placeholder} autoComplete="off"
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={hi >= 0 ? `${listId}-${hi}` : undefined}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} onKeyDown={key}
        />
        {value && !disabled && <button type="button" className="pp-clear" aria-label="Clear place" onClick={() => { onChange(''); setOpen(true); }}>×</button>}
        <button type="button" className="pp-caret" aria-label="Show places" tabIndex={-1} disabled={disabled} onClick={() => setOpen(!open)}><i /></button>
      </div>
      {open && !disabled && opts.length > 0 && (
        <ul className="pp-list" role="listbox" id={listId}>
          {opts.map(({ p, recent: r }, i) => (
            <li
              key={p} id={`${listId}-${i}`} role="option" aria-selected={p === value}
              className={(i === hi ? 'hi ' : '') + (p === value ? 'on ' : '') + (r ? 'recent' : '')}
              onMouseDown={(e) => { e.preventDefault(); choose(p); }} onMouseEnter={() => setHi(i)}
            >
              <span>{p}</span>{r && <small>Recent</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
