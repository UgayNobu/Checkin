// Fixed values shared across the backend.

// Roles as the API/frontend sees them. The database stores 'tutor' for teachers.
const ROLES = ['student', 'teacher', 'admin', 'management'];

// Attendance statuses that count as "attended".
const ATTENDED = ['Present', 'Late'];
// Statuses that mean "waiting for the tutor to decide".
const FLAGGED = ['Flagged', 'Pending review'];

const SESSION_TYPES = ['theory', 'practical'];
const SESSION_STATUS = { SCHEDULED: 'scheduled', ONGOING: 'ongoing', ENDED: 'ended' };

const FLAG_REASONS = { PERMISSION: 'permission_denied', OUTSIDE: 'outside_radius', ACCURACY: 'low_accuracy' };

const FILES = {
  relief: { maxBytes: 10 * 1024 * 1024, mimes: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] },
  avatar: { maxBytes: 2 * 1024 * 1024, mimes: ['image/png', 'image/jpeg', 'image/webp'] },
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

module.exports = { ROLES, ATTENDED, FLAGGED, SESSION_TYPES, SESSION_STATUS, FLAG_REASONS, FILES, WEEK_MS, DAY_MS };
