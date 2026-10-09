-- Makes Dechen's Supabase CheckIn database work with this backend.
-- Run ONCE in Supabase -> SQL Editor. Only ADDS columns/defaults; no data is deleted.
-- (Replaces checkin_extensions.sql — that file targets the wrong constraint name and misses a few things.)

BEGIN;

-- users: extra profile fields the frontend needs
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone              varchar(20),
  ADD COLUMN IF NOT EXISTS department         varchar(100),
  ADD COLUMN IF NOT EXISTS designation        varchar(50),
  ADD COLUMN IF NOT EXISTS programme          varchar(100),
  ADD COLUMN IF NOT EXISTS year               int,
  ADD COLUMN IF NOT EXISTS is_active          boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb       NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_at         timestamptz NOT NULL DEFAULT now();
-- keep the old status column in sync for existing rows
UPDATE users SET is_active = (status = 'active');

-- modules / sections / sessions
ALTER TABLE modules
  ADD COLUMN IF NOT EXISTS year int,
  ADD COLUMN IF NOT EXISTS semester int,
  ADD COLUMN IF NOT EXISTS enrolment_key varchar(30),
  ADD COLUMN IF NOT EXISTS module_count int;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS section_name varchar(30);
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS session_type varchar(10);
ALTER TABLE class_sessions DROP CONSTRAINT IF EXISTS chk_sessions_type;
ALTER TABLE class_sessions ADD CONSTRAINT chk_sessions_type
  CHECK (session_type IS NULL OR session_type IN ('theory','practical'));

-- relief_requests = the backend's "EvidenceDocument"
ALTER TABLE relief_requests
  ADD COLUMN IF NOT EXISTS leave_type varchar(10),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE relief_requests DROP CONSTRAINT IF EXISTS chk_relief_leave_type;
ALTER TABLE relief_requests ADD CONSTRAINT chk_relief_leave_type
  CHECK (leave_type IS NULL OR leave_type IN ('Medical','Official'));

-- enrollments: backend never sends academic_year, so give it a default
ALTER TABLE enrollments ALTER COLUMN academic_year SET DEFAULT '2026-27';
ALTER TABLE enrollments ALTER COLUMN enrolled_date SET DEFAULT CURRENT_DATE;

-- attendance: backend expects a check-in time
ALTER TABLE attendance ALTER COLUMN "timestamp" SET DEFAULT now();

-- notifications: backend uses the category 'Evidence Documents'
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notif_category;
ALTER TABLE notifications ADD CONSTRAINT chk_notif_category
  CHECK (category IN ('Attendance','Relief Requests','Evidence Documents','System','Reminders'));

COMMIT;
