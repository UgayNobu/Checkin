// The logged-in user's own profile: details, notification settings, photo.
const { prisma } = require('../lib/prisma');
const { saveFile, fileUrl, deleteFile } = require('../lib/storage');
const { userOut } = require('../utils/format');
const { BadRequest } = require('../utils/errors');

/** userOut + a browser-usable avatar URL (signed URL when files are in Supabase). */
const withAvatar = async (u) => ({ ...userOut(u), avatarUrl: await fileUrl(u.avatarUrl) });

const getProfile = async (userId) => withAvatar(await prisma.user.findUniqueOrThrow({ where: { id: userId } }));

async function updateProfile(userId, { name, email, phone, designation, prefs }) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  // Only send fields that were given, so { phone } alone doesn't wipe the name.
  // '' clears phone / designation. Department and programme are changed by the admin only.
  const data = Object.fromEntries(Object.entries({ name, email, phone, designation }).filter(([, v]) => v !== undefined)
    .map(([k, v]) => [k, (k === 'phone' || k === 'designation') && v === '' ? null : v]));
  if (data.email && data.email !== u.email) {
    const taken = await prisma.user.findFirst({ where: { email: data.email, id: { not: userId } }, select: { id: true } });
    if (taken) throw BadRequest('That email is already used by another account', 'EMAIL_TAKEN');
  }
  if (prefs) data.prefs = { ...(u.prefs || {}), ...prefs }; // merge, keep the other toggles
  if (data.prefs?.photo === '') delete data.prefs.photo; // "Remove photo"
  return withAvatar(await prisma.user.update({ where: { id: userId }, data }));
}

async function setAvatar(userId, file) {
  if (!file) throw BadRequest('Please choose a PNG, JPG or WebP image (max 2 MB)', 'NO_FILE');
  const old = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarUrl: true } });
  const stored = await saveFile(file, `avatars/${userId}`, userId);
  const u = await prisma.user.update({ where: { id: userId }, data: { avatarUrl: stored } });
  await deleteFile(old.avatarUrl);
  return withAvatar(u);
}

async function removeAvatar(userId) {
  const old = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarUrl: true } });
  const u = await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });
  await deleteFile(old.avatarUrl);
  return withAvatar(u);
}

module.exports = { getProfile, updateProfile, setAvatar, removeAvatar };
