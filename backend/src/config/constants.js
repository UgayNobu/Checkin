// Fixed values shared across the backend.

// Roles as the API/frontend sees them. The database stores 'tutor' for teachers.
const ROLES = ['student', 'teacher', 'admin', 'management'];

// Attendance statuses that count as "attended".
const ATTENDED = ['Present', 'Late'];
// Absent with an approved medical or official-leave document. Still NOT attended (the % stays
// real), but a student with approved evidence in a module only needs the lower at-risk line (80%)
// instead of the 90% requirement — the RUB rule.
const EXCUSED = 'Excused';
// Statuses that mean "waiting for the tutor to decide".
const FLAGGED = ['Flagged', 'Pending review'];

const SESSION_TYPES = ['theory', 'practical'];
const SESSION_STATUS = { SCHEDULED: 'scheduled', ONGOING: 'ongoing', ENDED: 'ended' };

const FLAG_REASONS = {
  PERMISSION: 'permission_denied', LOCATION: 'location_error', OUTSIDE: 'outside_radius', ACCURACY: 'low_accuracy', NETWORK: 'network_issue',
  SHARED_DEVICE: 'shared_device',
};
// Readable text for each flag reason (shown to tutors)
const FLAG_TEXT = {
  permission_denied: 'Location not shared',
  location_error: 'Browser could not get location',
  outside_radius: 'Outside classroom area',
  low_accuracy: 'Weak GPS accuracy',
  network_issue: 'Sent late (poor internet)',
  shared_device: 'Same phone as another student',
};

const FILES = {
  evidence: { maxBytes: 10 * 1024 * 1024, mimes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] },
  avatar: { maxBytes: 2 * 1024 * 1024, mimes: ['image/png', 'image/jpeg', 'image/webp'] },
  cover: { maxBytes: 10 * 1024 * 1024, mimes: ['image/png', 'image/jpeg', 'image/webp'] }, // module card image
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

module.exports = { ROLES, ATTENDED, EXCUSED, FLAGGED, SESSION_TYPES, SESSION_STATUS, FLAG_REASONS, FLAG_TEXT, FILES, WEEK_MS, DAY_MS };
