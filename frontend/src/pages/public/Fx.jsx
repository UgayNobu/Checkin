// Fx.jsx — the "live" pieces of the public pages (landing, login, sign-up):
//   Typing      – a headline word that types, pauses, deletes and moves to the next word
//   Ticker      – one short feature line at a time, sliding up
//   PhoneDemo   – a phone that loops through a check-in: code → location → Present ✓
//   Field       – an input with a floating label
//   Aurora      – slow moving colour light over the campus photo
// All decoration: with reduced motion the final state shows and nothing moves.
import { useEffect, useState } from 'react';
import { reduced } from '../../motion';

/* ---------- Typing headline word ---------- */
export function Typing({ words, hold = 1700 }) {
  const [i, setI] = useState(0);
  const [n, setN] = useState(() => (reduced() ? words[0].length : 0));
  const [del, setDel] = useState(false);
  useEffect(() => {
    if (reduced()) return undefined;
    const w = words[i];
    let t;
    if (!del && n < w.length) t = setTimeout(() => setN(n + 1), 85);
    else if (!del) t = setTimeout(() => setDel(true), hold);
    else if (n > 0) t = setTimeout(() => setN(n - 1), 45);
    else { setDel(false); setI((i + 1) % words.length); }
    return () => clearTimeout(t);
  }, [n, del, i, words, hold]);
  return (
    <span className="fx-type" aria-label={words.join(', ')}>
      <span aria-hidden="true">{words[i].slice(0, n)}</span>
      <i className="fx-caret" aria-hidden="true" />
    </span>
  );
}

/* ---------- Feature ticker ---------- */
export function Ticker({ items, every = 2600 }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced()) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % items.length), every);
    return () => clearInterval(t);
  }, [items.length, every]);
  return (
    <div className="fx-ticker" aria-live="off">
      <span key={i} className="fx-tick">{items[i]}</span>
    </div>
  );
}

/* ---------- Phone demo: a student checking in ---------- */
const CODE = 'K7Q2MX';
const STEPS = ['code', 'locate', 'done'];
export function PhoneDemo() {
  const [step, setStep] = useState(reduced() ? 2 : 0);
  const [typed, setTyped] = useState(reduced() ? CODE.length : 0);
  useEffect(() => {
    if (reduced()) return undefined;
    let t;
    if (step === 0 && typed < CODE.length) t = setTimeout(() => setTyped(typed + 1), 260);
    else if (step === 0) t = setTimeout(() => setStep(1), 700);
    else if (step === 1) t = setTimeout(() => setStep(2), 2100);
    else t = setTimeout(() => { setStep(0); setTyped(0); }, 3000);
    return () => clearTimeout(t);
  }, [step, typed]);
  const s = STEPS[step];
  return (
    <div className={'fx-phone is-' + s} aria-hidden="true">
      <div className="fx-notch" />
      <div className="fx-screen">
        <div className="fx-top"><img src="/logo.jpg" alt="" /><b>CheckIn</b><span className="fx-live">● LIVE</span></div>
        <small className="fx-mod">SWE303 · Software Project Management</small>
        <div className="fx-stage">
          {s === 'code' && (
            <div className="fx-pane" key="code">
              <small>Enter the class code</small>
              <div className="fx-code">
                {CODE.split('').map((c, k) => <span key={k} className={k < typed ? 'on' : ''}>{k < typed ? c : ''}</span>)}
              </div>
              <div className={'fx-btn' + (typed === CODE.length ? ' press' : '')}>Check in</div>
            </div>
          )}
          {s === 'locate' && (
            <div className="fx-pane" key="loc">
              <div className="fx-radar"><i /><i /><i /><b>📍</b></div>
              <small>Checking you are in the right building…</small>
            </div>
          )}
          {s === 'done' && (
            <div className="fx-pane" key="done">
              <div className="fx-tick-big"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24" /><path d="M14 27l8 8 16-17" /></svg></div>
              <b className="fx-present">Present</b>
              <small>Checked in · IT-02 · on time</small>
            </div>
          )}
        </div>
        <div className="fx-dots">{STEPS.map((x, k) => <i key={x} className={k <= step ? 'on' : ''} />)}</div>
      </div>
    </div>
  );
}

/* ---------- Floating-label input ---------- */
export function Field({ label, error, hint, select, children, ...props }) {
  return (
    <div className={'fl' + (error ? ' bad' : '') + (select ? ' fl-sel' : '')}>
      {select
        ? <select {...props} className={error ? 'bad' : ''}>{children}</select>
        : <input placeholder={hint || ' '} {...props} className={error ? 'bad' : ''} />}
      <label>{label}</label>
      {error && <small className="ferr">{error}</small>}
    </div>
  );
}

/* ---------- Moving light over the photo ---------- */
export const Aurora = () => (
  <div className="fx-aurora" aria-hidden="true"><i /><i /><i /></div>
);
