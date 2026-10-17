// Checks the email settings in backend/.env and sends one test email.
//   npm run mail:test -- you@example.com
const { env } = require('../src/config/env');
const { verifyMail, sendMail } = require('../src/lib/mailer');

(async () => {
  const to = process.argv[2];
  if (!to) {
    console.log('Usage: npm run mail:test -- you@example.com');
    process.exit(1);
  }
  console.log(`Logging in to ${env.smtp.host || '(no SMTP_HOST)'}:${env.smtp.port} as ${env.smtp.user || '(no SMTP_USER)'} …`);
  const v = await verifyMail();
  if (!v.ok) {
    console.error('✗ ' + v.error);
    process.exit(1);
  }
  console.log('✓ Login OK');
  await sendMail({ to, subject: 'CheckIn test email', text: 'This is a test email from CheckIn. If you can read this, password reset codes will arrive by email.' });
  console.log(`✓ Test email sent to ${to}. Check the inbox (and the Spam folder).`);
})().catch((e) => {
  console.error('✗ ' + (require('../src/lib/mailer').explain(e)));
  process.exit(1);
});
