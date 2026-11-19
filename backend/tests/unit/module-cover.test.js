// Module cover image (VLE-style course picture): only the module's own tutor or an admin can
// change it, the old picture is deleted, and the lists send a browser link (or null = pattern).
// The database and file storage are replaced with fakes, so nothing real is touched.
process.env.JWT_SECRET = 'test-secret';

const mockModules = new Map([['M054', { id: 'M054', code: 'SWE303', coverImage: 'db:old-file' }]]);
const mockSections = [{ moduleId: 'M054', tutorId: 'CST-0142' }];
jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    section: { findFirst: jest.fn(async ({ where }) => mockSections.find((s) => s.moduleId === where.moduleId && s.tutorId === where.tutorId) || null) },
    module: {
      findUnique: jest.fn(async ({ where }) => (mockModules.has(where.id) ? { ...mockModules.get(where.id) } : null)), // a copy, like a real query
      update: jest.fn(async ({ where, data }) => Object.assign(mockModules.get(where.id), data)),
    },
  },
}));
jest.mock('../../src/lib/academicSession', () => ({
  currentAcademicSession: jest.fn(async () => 'AS2026'),
  sessionOrCurrent: jest.fn(async () => 'AS2026'),
}));
const mockDeleted = [];
jest.mock('../../src/lib/storage', () => ({
  saveFile: jest.fn(async () => 'db:new-file'),
  deleteFile: jest.fn(async (v) => { mockDeleted.push(v); }),
  fileUrl: jest.fn(async (v) => (v ? `/api/files/${v.slice(3)}?exp=1&sig=x` : null)),
}));

const { setCover, removeCover } = require('../../src/services/module.service');
const file = { buffer: Buffer.from('img'), mimetype: 'image/jpeg', originalname: 'cover.jpg', size: 3 };

beforeEach(() => { mockModules.get('M054').coverImage = 'db:old-file'; mockDeleted.length = 0; });

describe('module cover image', () => {
  test('TC-UNIT-121: the module\'s tutor can set a cover; the old picture is deleted and a link comes back', async () => {
    const r = await setCover('M054', { id: 'CST-0142', role: 'teacher' }, file);
    expect(r.coverUrl).toMatch(/^\/api\/files\/new-file/);
    expect(mockModules.get('M054').coverImage).toBe('db:new-file');
    expect(mockDeleted).toEqual(['db:old-file']);
  });

  test('TC-UNIT-122: edge case - another tutor cannot change a module they do not teach', async () => {
    await expect(setCover('M054', { id: 'CST-0143', role: 'teacher' }, file)).rejects.toMatchObject({ status: 403, code: 'NOT_YOUR_MODULE' });
    expect(mockModules.get('M054').coverImage).toBe('db:old-file');
  });

  test('TC-UNIT-123: an admin can remove a cover, so the card goes back to the coloured pattern', async () => {
    const r = await removeCover('M054', { id: 'CST-ICT01', role: 'admin' });
    expect(r.coverUrl).toBeNull();
    expect(mockModules.get('M054').coverImage).toBeNull();
    expect(mockDeleted).toEqual(['db:old-file']);
  });

  test('TC-UNIT-124: edge case - no file chosen is refused', async () => {
    await expect(setCover('M054', { id: 'CST-0142', role: 'teacher' }, undefined)).rejects.toMatchObject({ status: 400, code: 'NO_FILE' });
  });
});
