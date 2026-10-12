// ─────────────────────────────────────────────────────────────
// File storage for evidence documents and avatars.
//
// • If SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, files go to a
//   PRIVATE Supabase Storage bucket. The DB stores "storage:<path>" and
//   we hand out short-lived signed URLs when a file is viewed.
// • Otherwise files are written to backend/uploads/ and served at /uploads.
// ─────────────────────────────────────────────────────────────
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { env } = require('../config/env');

const LOCAL_DIR = path.join(__dirname, '..', '..', 'uploads');
const PREFIX = 'storage:';
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

/** Saves a multer memory file. Returns the value to store in the DB. */
async function saveFile(file, folder) {
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${EXT[file.mimetype] || path.extname(file.originalname)}`;
  const key = `${folder}/${name}`;
  if (useSupabase()) {
    const { error } = await supabase().storage.from(env.supabase.bucket).upload(key, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) throw new Error('Could not upload the file: ' + error.message);
    return PREFIX + key;
  }
  await fs.mkdir(path.join(LOCAL_DIR, folder), { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, folder, name), file.buffer);
  return `/uploads/${key}`;
}

/** Turns a stored value into something a browser can open. */
async function fileUrl(stored) {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored; // local path or old absolute URL
  if (!useSupabase()) return null;
  const { data, error } = await supabase().storage.from(env.supabase.bucket).createSignedUrl(stored.slice(PREFIX.length), 60 * 60);
  return error ? null : data.signedUrl;
}

/** Best-effort delete (used when an avatar is replaced or removed). */
async function deleteFile(stored) {
  try {
    if (!stored) return;
    if (stored.startsWith(PREFIX)) {
      if (useSupabase()) await supabase().storage.from(env.supabase.bucket).remove([stored.slice(PREFIX.length)]);
    } else if (stored.startsWith('/uploads/')) {
      await fs.unlink(path.join(LOCAL_DIR, stored.slice('/uploads/'.length)));
    }
  } catch { /* the file may already be gone — ignore */ }
}

module.exports = { saveFile, fileUrl, deleteFile, LOCAL_DIR, useSupabase };
