// motion.js — the moving parts of the design: entrances, count-up numbers, toasts and confetti.
// Everything here is decoration only: pages work the same without it, and people who ask their
// device for less motion (prefers-reduced-motion) get the final state straight away.
import { createElement, useEffect, useRef, useState } from 'react';

export const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const phone = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 760px)').matches;

/* ---------- Count-up numbers ---------- */
/** Counts from 0 up to `to` once it is known. Returns the number to show right now. */
export function useCountUp(to, ms = 900) {
  const [v, setV] = useState(() => (reduced() || typeof to !== 'number' ? to : 0));
  const from = useRef(0);
  useEffect(() => {
    if (typeof to !== 'number' || !Number.isFinite(to)) { setV(to); return undefined; }
    if (reduced()) { setV(to); from.current = to; return undefined; }
    const start = performance.now(), a = from.current;
    let raf;
    const step = (t) => {
      const k = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - k, 3); // ease-out
      setV(a + (to - a) * e);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return v;
}

/**
 * <CountUp value="87%" />, <CountUp value={12} />. Text like "–" or "No classes" is shown as it is.
 * Keeps any suffix (%, h, …) and the number of decimals of the final value.
 */
export function CountUp({ value, ms }) {
  const m = typeof value === 'number' ? [String(value), String(value), ''] : String(value ?? '').match(/^(-?\d+(?:\.\d+)?)(.*)$/);
  const target = m ? Number(m[1]) : null;
  const dec = m && m[1].includes('.') ? m[1].split('.')[1].length : 0;
  const v = useCountUp(target, ms);
  if (!m) return value ?? null;
  return `${Number(v).toFixed(dec)}${m[2]}`;
}

/* ---------- Entrances: cards rise in one after another ---------- */
// Card-like blocks in every page. New ones (after data loads) get the entrance too.
const CARD_SEL = [
  '.card', '.stat', '.panel', '.rp-card', '.rp-tile', '.vc-card', '.course', '.dept', '.ao-stat', '.pv-stat', '.tch-stat',
  '.hx-stats > *', '.rcard', '.evx-card', '.mm-card', '.vk-box', '.sw-box', '.big', '.chartbox', '.rec-modcard', '.tt-card',
  '.as-box', '.cc-box', '.trend-card', '.selectors-card', '.calbox', '.pbox', '.rec-box', '.td-card', '.td-class', '.ccard',
  '.tbl', '.rp-tbl', '.page table tbody tr',
].join(',');

/** Watches a container and gives each new card a staggered entrance (rows of a table too). */
export function useEntrances(ref, key) {
  useEffect(() => {
    const root = ref.current;
    if (!root || reduced()) return undefined;
    let timer = null;
    // cards further down rise when scrolled into view (a short stagger within each group that appears together)
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((list) => {
      list.filter((e) => e.isIntersecting).forEach((e, k) => {
        e.target.style.setProperty('--d', `${Math.min(k * 60, 300)}ms`);
        e.target.dataset.anim = 'in';
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -4% 0px' }) : null;
    const scan = () => {
      const fresh = [...root.querySelectorAll(CARD_SEL)].filter((el) => !el.dataset.anim);
      const vh = window.innerHeight;
      fresh.forEach((el, i) => {
        const row = el.tagName === 'TR';
        const d = Math.min(row ? i * 35 : i * 70, 600);
        el.style.setProperty('--d', `${d}ms`);
        const top = el.getBoundingClientRect().top;
        if (!io || top < vh) el.dataset.anim = 'in';
        else { el.dataset.anim = 'wait'; io.observe(el); }
      });
    };
    scan();
    const mo = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(scan, 30); });
    mo.observe(root, { childList: true, subtree: true });
    return () => { mo.disconnect(); io?.disconnect(); clearTimeout(timer); };
  }, [ref, key]);
}

/* ---------- Toasts ---------- */
/** toast('Saved', 'ok' | 'bad' | 'info') — a small message that slides in at the bottom and leaves by itself. */
export function toast(text, tone = 'ok', ms = 3200) {
  if (typeof document === 'undefined') return;
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + tone;
  const icon = document.createElement('i');
  icon.textContent = tone === 'bad' ? '!' : tone === 'info' ? 'i' : '✓';
  const msg = document.createElement('span');
  msg.textContent = text;
  t.append(icon, msg);
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 350); }, ms);
}

/* ---------- Confetti (successful check-in) ---------- */
const COLORS = ['#0f6cbf', '#12867a', '#e07b16', '#7b4fbf', '#ffc61a', '#2a78d6', '#1baf7a'];
export function confetti({ count } = {}) {
  if (typeof document === 'undefined' || reduced()) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  document.body.appendChild(c);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const n = count || (phone() ? 90 : 160);
  const bits = Array.from({ length: n }, (_, i) => {
    const left = i % 2 === 0; // two cannons, bottom left and right
    const ang = (left ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9;
    const sp = 9 + Math.random() * 9;
    return {
      x: left ? 0 : innerWidth, y: innerHeight * 0.85, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 1.25,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      c: COLORS[i % COLORS.length], round: Math.random() < 0.3,
    };
  });
  const t0 = performance.now();
  const frame = (t) => {
    const age = t - t0;
    g.clearRect(0, 0, innerWidth, innerHeight);
    bits.forEach((b) => {
      b.vy += 0.32; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.globalAlpha = Math.max(0, 1 - age / 3200);
      g.fillStyle = b.c;
      if (b.round) { g.beginPath(); g.arc(0, 0, b.w / 2, 0, Math.PI * 2); g.fill(); } else g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2)));
      g.restore();
    });
    if (age < 3200) requestAnimationFrame(frame); else c.remove();
  };
  requestAnimationFrame(frame);
}

/* ---------- Small helpers ---------- */
/** A skeleton block while data loads: <Skeleton rows={3} /> */
export function Skeleton({ rows = 3, tiles = 0 }) {
  return createElement('div', { className: 'skel-wrap', 'aria-busy': 'true', 'aria-label': 'Loading' },
    tiles > 0 && createElement('div', { className: 'skel-tiles' }, ...Array.from({ length: tiles }, (_, i) => createElement('div', { key: i, className: 'skel skel-tile' }))),
    ...Array.from({ length: rows }, (_, i) => createElement('div', { key: 'r' + i, className: 'skel skel-row', style: { width: `${92 - (i % 3) * 14}%` } })));
}
