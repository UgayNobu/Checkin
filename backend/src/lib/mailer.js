// ─────────────────────────────────────────────────────────────
// Optional email. Two ways to send, chosen from the settings:
//   1. BREVO_API_KEY set  → Brevo's email API over HTTPS (used on Render, whose free
//      plan blocks the SMTP ports 25/465/587, so Gmail SMTP cannot work there).
//   2. SMTP_HOST set      → SMTP, e.g. Gmail with an App password (fine on a laptop).
// With neither, emails are skipped and users still get the in-app notification.
// ─────────────────────────────────────────────────────────────
const { env } = require('../config/env');

const BREVO_URL = 'https://api.brevo.com/v3';
const useBrevo = () => Boolean(env.brevoApiKey);
const isSmtpConfigured = () => useBrevo() || Boolean(env.smtp.host);
const provider = () => (useBrevo() ? 'brevo' : env.smtp.host ? 'smtp' : null);

/** "CheckIn <me@gmail.com>" → { name: 'CheckIn', email: 'me@gmail.com' } */
function parseFrom(from) {
  const m = /^\s*"?([^"<]*?)"?\s*<\s*([^>\s]+)\s*>\s*$/.exec(from || '');
  if (m) return { name: m[1].trim() || 'CheckIn', email: m[2] };
  return { name: 'CheckIn', email: String(from || '').trim() };
}

const toHtml = (text) => `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">
    <p>${String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>
    <p style="color:#777;font-size:12px">CheckIn · College of Science and Technology</p></div>`;

// ---------- Brevo (HTTPS) ----------
async function brevo(path, init = {}) {
  const r = await fetch(BREVO_URL + path, {
    ...init,
    headers: { 'api-key': env.brevoApiKey, accept: 'application/json', 'content-type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) {
    let body = {};
    try { body = await r.json(); } catch { /* not JSON */ }
    throw Object.assign(new Error(body.message || `Brevo answered ${r.status}`), { code: 'BREVO', status: r.status, brevoCode: body.code });
  }
  return r.status === 204 ? {} : r.json();
}

// ---------- SMTP ----------
let transport = null;
function getTransport() {
  if (!transport) {
    const nodemailer = require('nodemailer');
    transport = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transport;
}

async function sendMail({ to, subject, text }) {
  if (!isSmtpConfigured() || !to) return false;
  const html = toHtml(text);
  if (useBrevo()) {
    await brevo('/smtp/email', { method: 'POST', body: JSON.stringify({ sender: parseFrom(env.smtp.from), to: [{ email: to }], subject, textContent: String(text), htmlContent: html }) });
  } else {
    await getTransport().sendMail({ from: env.smtp.from, to, subject, text, html });
  }
  return true;
}

/** Fire-and-forget: never blocks or breaks the request that triggered it. */
function sendMailInBackground(msg) {
  sendMail(msg).catch((e) => console.warn('[mailer] failed:', explain(e)));
}

/** Turns common email errors into a sentence that says what to fix. */
function explain(e) {
  if (e.code === 'BREVO') {
    if (e.status === 401) return 'Brevo rejected the API key. Check BREVO_API_KEY (Brevo → SMTP & API → API keys).';
    if (/sender/i.test(e.message)) return `Brevo refused the sender "${parseFrom(env.smtp.from).email}". Add and verify it in Brevo → Senders, and use it in MAIL_FROM.`;
    return `Brevo: ${e.message}`;
  }
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return 'Brevo did not answer in 15 seconds. Check the internet connection.';
  if (e.code === 'EAUTH' || /535|Username and Password not accepted/i.test(e.message)) {
    return 'Gmail rejected the login. Check SMTP_USER, and use a 16-letter App password as SMTP_PASS (not your normal Gmail password).';
  }
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS'].includes(e.code)) {
    return `Could not reach ${env.smtp.host}:${env.smtp.port}. Check SMTP_HOST / SMTP_PORT and your internet connection (some networks, and Render's free plan, block port 587: use BREVO_API_KEY there).`;
  }
  return e.message;
}

/** Checks the settings without sending anything. Returns { ok, error, via }. */
async function verifyMail() {
  if (!isSmtpConfigured()) return { ok: false, error: 'Email is not set up: add BREVO_API_KEY, or SMTP_HOST/SMTP_USER/SMTP_PASS, to backend/.env' };
  try {
    if (useBrevo()) {
      await brevo('/account');
      return { ok: true, via: `Brevo API as ${parseFrom(env.smtp.from).email}` };
    }
    await getTransport().verify();
    return { ok: true, via: `${env.smtp.host} as ${env.smtp.user}` };
  } catch (e) {
    return { ok: false, error: explain(e) };
  }
}

module.exports = { sendMail, sendMailInBackground, isSmtpConfigured, verifyMail, explain, parseFrom, provider };
