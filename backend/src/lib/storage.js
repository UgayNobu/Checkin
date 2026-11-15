// ─────────────────────────────────────────────────────────────
// File storage for evidence documents and avatars.
//
// • If SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, files go to a
//   PRIVATE Supabase Storage bucket. The DB stores "storage:<path>" and
//   we hand out short-lived signed URLs when a file is viewed.
// • Otherwise files are saved in the stored_files table (database.sql
//   Part 8). The DB stores "db:<uuid>" and the file is served at
//   /api/files/<uuid>. This works the same on every teammate's laptop
//   and on the deployed server, because they all share one database.
// • Old rows may still hold "/uploads/..." (files saved on one laptop's
//   disk before this change); those are still served from backend/uploads/.
// ─────────────────────────────────────────────────────────────
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { env } = require('../config/env');
const { prisma } = require('./prisma');

const LOCAL_DIR = path.join(__dirname, '..', '..', 'uploads');
const PREFIX = 'storage:';
const DB = 'db:';
let client = null;

const useSupabase = () => Boolean(env.supabase.url && env.supabase.serviceKey);

function supabase() {
  if (!client) {
    const { createClient } = require('@supabase/supabase-js');
    client = createClient(env.supabase.url, env.supabase.serviceKey, { auth: { persistSession: false } });
  }
  return client;
}

const EXT = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

/** Saves a multer memory file for ownerId. Returns the value to store in the DB. */
async function saveFile(file, folder, ownerId) {
  if (useSupabase()) {
    const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${EXT[file.mimetype] || path.extname(file.originalname)}`;
    const key = `${folder}/${name}`;
    const { error } = await supabase().storage.from(env.supabase.bucket).upload(key, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) throw new Error('Could not upload the file: ' + error.message);
    return PREFIX + key;
  }
  const row = await prisma.storedFile.create({
    data: { ownerId, mimeType: file.mimetype, originalName: file.originalname?.slice(0, 255) ?? null, sizeBytes: file.size ?? file.buffer.length, content: file.buffer },
    select: { id: true },
  });
  return DB + row.id;
}

// Database files are served at /api/files/<id>?exp=…&sig=… : the link only works for a few hours, so a
// forwarded or copied link stops working (like Supabase's signed URLs). The expiry is rounded up to the
// hour, so the same file gets the same link for a while and the browser can cache it.
const LINK_HOURS = 6;
const HOUR_S = 3600;
const sign = (id, exp) => crypto.createHmac('sha256', env.jwtSecret).update(`file:${id}.${exp}`).digest('base64url').slice(0, 32);

/** A link to a database file that stops working after LINK_HOURS hours. */
function signedFilePath(id, now = Date.now()) {
  const exp = Math.ceil((now / 1000 + LINK_HOURS * HOUR_S) / HOUR_S) * HOUR_S;
  return `/api/files/${id}?exp=${exp}&sig=${sign(id, exp)}`;
}

/** true when ?exp & sig are ours and the link has not run out */
function checkFileLink(id, exp, sig, now = Date.now()) {
  const e = Number(exp);
  if (!Number.isInteger(e) || e * 1000 < now || typeof sig !== 'string') return false;
  const want = Buffer.from(sign(id, e)), got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

/** Turns a stored value into something a browser can open. */
async function fileUrl(stored) {
  if (!stored) return null;
  if (stored.startsWith(DB)) return signedFilePath(stored.slice(DB.length));
  if (!stored.startsWith(PREFIX)) return stored; // old local path or absolute URL
  if (!useSupabase()) return null;
  const { data, error } = await supabase().storage.from(env.supabase.bucket).createSignedUrl(stored.slice(PREFIX.length), 60 * 60);
  return error ? null : data.signedUrl;
}

/** Best-effort delete (used when an avatar is replaced or removed). */
async function deleteFile(stored) {
  try {
    if (!stored) return;
    if (stored.startsWith(DB)) {
      await prisma.storedFile.delete({ where: { id: stored.slice(DB.length) } });
    } else if (stored.startsWith(PREFIX)) {
      if (useSupabase()) await supabase().storage.from(env.supabase.bucket).remove([stored.slice(PREFIX.length)]);
    } else if (stored.startsWith('/uploads/')) {
      await fs.unlink(path.join(LOCAL_DIR, stored.slice('/uploads/'.length)));
    }
  } catch { /* the file may already be gone — ignore */ }
}

/** Reads a database-stored file by id (for GET /api/files/:id). */
const readFile = (id) => prisma.storedFile.findUnique({ where: { id }, select: { mimeType: true, originalName: true, content: true } });

module.exports = { saveFile, fileUrl, deleteFile, readFile, LOCAL_DIR, useSupabase, signedFilePath, checkFileLink };
