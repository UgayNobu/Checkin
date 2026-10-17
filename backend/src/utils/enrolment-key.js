// Enrolment keys: what a tutor shares so students can join a module.

/** e.g. IDE201 + year 3 + semester 1 → "IDE201-3-T1-K7Q". The short random tail stops guessing. */
function suggestEnrolmentKey(moduleCode, year, semester) {
  const code = String(moduleCode || 'MOD').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const tail = Math.random().toString(36).slice(2, 5).toUpperCase();
  return [code, year || null, semester ? 'T' + semester : null, tail].filter(Boolean).join('-').slice(0, 30);
}

/** Returns an error message, or null when the key is fine. */
function validateEnrolmentKey(key) {
  const k = String(key || '').trim();
  if (k.length < 3) return 'Key must be at least 3 characters.';
  if (k.length > 30) return 'Key must be at most 30 characters.';
  if (!/^[A-Za-z0-9_-]+$/.test(k)) return 'Key may contain letters, digits, dashes and underscores only.';
  return null;
}

const normalizeEnrolmentKey = (key) => String(key || '').trim().toUpperCase();

module.exports = { suggestEnrolmentKey, validateEnrolmentKey, normalizeEnrolmentKey };
