// ─────────────────────────────────────────────────────────────
// Optional email. If SMTP_HOST is empty, emails are skipped silently
// and users still get the in-app notification.
// ─────────────────────────────────────────────────────────────
const { env } = require('../config/env');

let transport = null;
const isSmtpConfigured = () => Boolean(env.smtp.host);

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
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">
    <p>${String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>
    <p style="color:#777;font-size:12px">CheckIn · College of Science and Technology</p></div>`;
  await getTransport().sendMail({ from: env.smtp.from, to, subject, text, html });
  return true;
}

/** Fire-and-forget: never blocks or breaks the request that triggered it. */
function sendMailInBackground(msg) {
  sendMail(msg).catch((e) => console.warn('[mailer] failed:', e.message));
}

module.exports = { sendMail, sendMailInBackground, isSmtpConfigured };
