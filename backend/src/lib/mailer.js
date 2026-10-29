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

// ---------- Email design ----------
const NAVY = '#1F3A5F';
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The live site's address (first https FRONTEND_URL), used for the button and the logo. */
function appUrl() {
  const urls = env.frontendUrls || [];
  return urls.find((u) => /^https:\/\//.test(u)) || urls[0] || '';
}

/**
 * One email layout for everything CheckIn sends: navy header with the logo, "Hello NAME",
 * the message, an optional big code, an "Open CheckIn" button and a footer.
 * Table-based with inline styles so it looks the same in Gmail, Outlook and phone apps.
 */
function renderEmail({ name, text, code, link = appUrl(), button = 'Open CheckIn' }) {
  const body = esc(text).replace(/\n/g, '<br>');
  const logo = link ? `<img src="${esc(link.replace(/\/$/, ''))}/logo.jpg" width="40" height="40" alt="" style="border-radius:50%;vertical-align:middle;margin-right:10px;background:#fff">` : '';
  const codeBox = code ? `<tr><td style="padding:4px 32px 8px"><div style="font-size:13px;color:#5f6368;margin-bottom:6px">Your code</div>
      <div style="display:inline-block;font-family:'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:${NAVY};background:#EAF1F8;border:1px solid #BFD0E3;border-radius:8px;padding:12px 20px">${esc(code)}</div></td></tr>` : '';
  const btn = link ? `<tr><td style="padding:16px 32px 8px"><a href="${esc(link)}" style="display:inline-block;background:${NAVY};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:6px">${esc(button)}</a></td></tr>` : '';
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f1f3f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f3f4;padding:24px 0"><tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1f1f1f">
    <tr><td style="background:${NAVY};padding:16px 32px;color:#ffffff;font-size:20px;font-weight:700">${logo}CheckIn</td></tr>
    <tr><td style="padding:28px 32px 8px;font-size:16px">Hello ${esc(name || 'there')},</td></tr>
    <tr><td style="padding:8px 32px;font-size:15px;line-height:1.6">${body}</td></tr>
    ${codeBox}${btn}
    <tr><td style="padding:24px 32px 24px;font-size:12px;color:#80868b;line-height:1.5;border-top:1px solid #eceff1">
      CheckIn · Student Attendance System<br>College of Science and Technology, Royal University of Bhutan<br>
      This is an automatic message, please don't reply.${code ? '' : ' Students can turn these emails off in CheckIn → Settings.'}</td></tr>
  </table></td></tr></table></body></html>`;
}

/** The plain-text version (for clients that don't show HTML). */
function renderText({ name, text, code, link = appUrl() }) {
  return [`Hello ${name || 'there'},`, '', text, ...(code ? ['', `Your code: ${code}`] : []), ...(link ? ['', `Open CheckIn: ${link}`] : []),
    '', '--', 'CheckIn · College of Science and Technology'].join('\n');
}

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

/** sendMail({ to, subject, text, name?, code?, link? }) — text is the message without the greeting. */
async function sendMail({ to, subject, text, name, code, link }) {
  if (!isSmtpConfigured() || !to) return false;
  const opts = { name, text, code, ...(link !== undefined && { link }) };
  const html = renderEmail(opts);
  const plain = renderText(opts);
  if (useBrevo()) {
    await brevo('/smtp/email', { method: 'POST', body: JSON.stringify({ sender: parseFrom(env.smtp.from), to: [{ email: to }], subject, textContent: plain, htmlContent: html }) });
  } else {
    await getTransport().sendMail({ from: env.smtp.from, to, subject, text: plain, html });
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

module.exports = { sendMail, sendMailInBackground, isSmtpConfigured, verifyMail, explain, parseFrom, provider, renderEmail, renderText, appUrl };
