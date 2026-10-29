// Email sending: chooses Brevo (HTTPS) when BREVO_API_KEY is set, otherwise SMTP.
// fetch is replaced with a fake, so no real email is sent.
const load = (vars) => {
  jest.resetModules();
  for (const k of ['BREVO_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM']) delete process.env[k];
  Object.assign(process.env, { JWT_SECRET: 'test-secret' }, vars);
  return require('../../src/lib/mailer');
};

afterEach(() => { delete global.fetch; });

describe('parseFrom', () => {
  const { parseFrom } = load({});
  test('TC-UNIT-40: "Name <email>" is split into name and email', () => {
    expect(parseFrom('CheckIn <me@gmail.com>')).toEqual({ name: 'CheckIn', email: 'me@gmail.com' });
  });
  test('TC-UNIT-41: edge case - a bare address gets the name CheckIn', () => {
    expect(parseFrom('me@gmail.com')).toEqual({ name: 'CheckIn', email: 'me@gmail.com' });
  });
});

describe('choosing how to send', () => {
  test('TC-UNIT-42: with BREVO_API_KEY, Brevo is used even if SMTP is also set', () => {
    const m = load({ BREVO_API_KEY: 'k', SMTP_HOST: 'smtp.gmail.com' });
    expect(m.provider()).toBe('brevo');
    expect(m.isSmtpConfigured()).toBe(true);
  });
  test('TC-UNIT-43: with only SMTP_HOST, SMTP is used', () => {
    expect(load({ SMTP_HOST: 'smtp.gmail.com' }).provider()).toBe('smtp');
  });
  test('TC-UNIT-44: bad input - with neither, nothing is sent', async () => {
    const m = load({});
    expect(m.provider()).toBeNull();
    await expect(m.sendMail({ to: 'a@b.c', subject: 's', text: 't' })).resolves.toBe(false);
  });
});

describe('sending through Brevo', () => {
  test('TC-UNIT-45: posts the sender, recipient, subject and both text and HTML', async () => {
    const m = load({ BREVO_API_KEY: 'key123', MAIL_FROM: 'CheckIn <me@gmail.com>' });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ messageId: 'x' }) });
    await expect(m.sendMail({ to: 'student@rub.edu.bt', subject: 'Code', text: 'Your code is 123456' })).resolves.toBe(true);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers['api-key']).toBe('key123');
    const body = JSON.parse(init.body);
    expect(body.sender).toEqual({ name: 'CheckIn', email: 'me@gmail.com' });
    expect(body.to).toEqual([{ email: 'student@rub.edu.bt' }]);
    expect(body.textContent).toContain('123456');
    expect(body.htmlContent).toContain('123456');
  });
  test('TC-UNIT-46: bad input - a wrong API key gives a clear message', async () => {
    const m = load({ BREVO_API_KEY: 'wrong' });
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ code: 'unauthorized', message: 'Key not found' }) });
    const r = await m.verifyMail();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/BREVO_API_KEY/);
  });
});
