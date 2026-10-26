// ─────────────────────────────────────────────────────────────
// Optional SMS. Works like the mailer: if SMS is not set up in .env,
// texts are skipped silently and users still get the in-app
// notification (and the email).
//
// No extra library: it uses Node's built-in fetch (Node 18+).
//
// Two ways to set it up (backend/.env):
//  1) Twilio
//       SMS_PROVIDER=twilio
//       TWILIO_ACCOUNT_SID=ACxxxxxxxx
//       TWILIO_AUTH_TOKEN=xxxxxxxx
//       TWILIO_FROM=+15551234567
//  2) Any HTTP SMS gateway (e.g. a local Bhutan Telecom / TashiCell bulk-SMS API)
//       SMS_PROVIDER=http
//       SMS_HTTP_URL=https://gateway.example.com/send
//       SMS_HTTP_TOKEN=xxxxxxxx           (sent as "Authorization: Bearer ...")
//     The gateway receives a JSON POST: { "to": "+975...", "message": "..." }
// ─────────────────────────────────────────────────────────────
const { env } = require('../config/env');

const isSmsConfigured = () =>
  (env.sms.provider === 'twilio' && Boolean(env.sms.twilioSid && env.sms.twilioToken && env.sms.twilioFrom)) ||
  (env.sms.provider === 'http' && Boolean(env.sms.httpUrl));

/** Bhutan numbers are often typed as 8 digits (17xxxxxx); add +975 when no country code is given. */
function toE164(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return '+' + digits.slice(2);
  if (digits.length === 8) return '+975' + digits;
  return '+' + digits;
}

/** SMS is short: keep one message (160 characters). */
const shorten = (text) => {
  const t = `CheckIn: ${String(text).replace(/\s+/g, ' ').trim()}`;
  return t.length > 160 ? t.slice(0, 157) + '...' : t;
};

async function sendSms({ to, text }) {
  const number = toE164(to);
  if (!isSmsConfigured() || !number) return false;
  const message = shorten(text);

  if (env.sms.provider === 'twilio') {
    const auth = Buffer.from(`${env.sms.twilioSid}:${env.sms.twilioToken}`).toString('base64');
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.sms.twilioSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: number, From: env.sms.twilioFrom, Body: message }),
    });
    if (!r.ok) throw new Error(`Twilio answered ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return true;
  }

  const r = await fetch(env.sms.httpUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(env.sms.httpToken && { Authorization: `Bearer ${env.sms.httpToken}` }) },
    body: JSON.stringify({ to: number, message }),
  });
  if (!r.ok) throw new Error(`SMS gateway answered ${r.status}`);
  return true;
}

/** Fire-and-forget: never blocks or breaks the request that triggered it. */
function sendSmsInBackground(msg) {
  sendSms(msg).catch((e) => console.warn('[sms] failed:', e.message));
}

module.exports = { sendSms, sendSmsInBackground, isSmsConfigured, toE164 };
