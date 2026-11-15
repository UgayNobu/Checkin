// notify(): every user gets the in-app notification, but only active accounts get the email.
const mockUsers = new Map();
const mockSend = jest.fn();
jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    notification: { create: jest.fn(async () => ({})) },
    user: { findUnique: jest.fn(async ({ where }) => mockUsers.get(where.id) ?? null) },
  },
}));
jest.mock('../../src/lib/mailer', () => ({ sendMailInBackground: (m) => mockSend(m) }));

const { prisma } = require('../../src/lib/prisma');
const { notify } = require('../../src/services/notifications.service');

beforeEach(() => { mockSend.mockClear(); prisma.notification.create.mockClear(); });
const user = (id, extra) => mockUsers.set(id, { email: `${id}@rub.edu.bt`, name: id, prefs: {}, isActive: true, status: 'active', ...extra });

test('TC-UNIT-97: an active student gets the notification and the email', async () => {
  user('S1');
  await notify('S1', 'Your attendance is 80%', 'Attendance', { email: 'Low attendance' });
  expect(prisma.notification.create).toHaveBeenCalled();
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: 'S1@rub.edu.bt', subject: 'Low attendance' }));
});

test('TC-UNIT-98: a deactivated student gets the in-app notification but no email', async () => {
  user('S2', { isActive: false, status: 'inactive' });
  await notify('S2', 'Class cancelled', 'Timetable', { email: 'Class cancelled' });
  expect(prisma.notification.create).toHaveBeenCalled();
  expect(mockSend).not.toHaveBeenCalled();
});

test('TC-UNIT-99: edge case - a user deleted from the database gets no email and nothing breaks', async () => {
  prisma.notification.create.mockRejectedValueOnce(new Error('foreign key: user not found'));
  await expect(notify('GONE', 'x', 'Attendance', { email: 'x' })).resolves.toBeUndefined();
  expect(mockSend).not.toHaveBeenCalled();
});
