-- CheckIn database file: structure changes + real data, in one place.
-- Run the whole file in Supabase -> SQL Editor. Safe to run again: it only ADDS
-- columns/constraints (IF NOT EXISTS) and skips rows that already exist.
-- `npm run seed` runs only the SEED DATA part (below the marker).

BEGIN;

-- ===== Part 0: rename relief_requests -> evidence_documents, remove the credit system =====
DO $$
BEGIN
  IF to_regclass('public.relief_requests') IS NOT NULL AND to_regclass('public.evidence_documents') IS NULL THEN
    ALTER TABLE relief_requests RENAME TO evidence_documents;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'evidence_documents' AND column_name = 'request_id') THEN
    ALTER TABLE evidence_documents RENAME COLUMN request_id TO evidence_id;
  END IF;
  IF to_regclass('public.seq_relief') IS NOT NULL AND to_regclass('public.seq_evidence') IS NULL THEN
    ALTER SEQUENCE seq_relief RENAME TO seq_evidence;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_relief_status') THEN
    ALTER TABLE evidence_documents RENAME CONSTRAINT chk_relief_status TO chk_evidence_status;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_relief_module') THEN
    ALTER TABLE evidence_documents RENAME CONSTRAINT fk_relief_module TO fk_evidence_module;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_relief_reviewer') THEN
    ALTER TABLE evidence_documents RENAME CONSTRAINT fk_relief_reviewer TO fk_evidence_reviewer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_relief_student') THEN
    ALTER TABLE evidence_documents RENAME CONSTRAINT fk_relief_student TO fk_evidence_student;
  END IF;
END $$;
ALTER INDEX IF EXISTS relief_requests_pkey   RENAME TO evidence_documents_pkey;
ALTER INDEX IF EXISTS idx_relief_module_date RENAME TO idx_evidence_module_date;
ALTER INDEX IF EXISTS idx_relief_student     RENAME TO idx_evidence_student;
ALTER TABLE evidence_documents DROP CONSTRAINT IF EXISTS chk_relief_leave_type;
ALTER TABLE evidence_documents ALTER COLUMN evidence_id SET DEFAULT gen_id('E', 'seq_evidence');

-- existing IDs R001.. become E001.., and old wording is updated
UPDATE evidence_documents SET evidence_id = 'E' || substring(evidence_id from 2) WHERE evidence_id ~ '^R[0-9]+$';
UPDATE evidence_documents SET document_url = replace(replace(document_url, '/uploads/relief/R', '/uploads/evidence/E'), '/uploads/relief/', '/uploads/evidence/')
  WHERE document_url LIKE '/uploads/relief/%';
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notif_category;
UPDATE notifications SET category = 'Evidence Documents' WHERE category = 'Relief Requests';
UPDATE notifications SET message = replace(replace(message, 'relief request R', 'evidence document E'), 'relief request', 'evidence document')
  WHERE message ILIKE '%relief request%';

-- credit system removed (decided by the team)
DROP VIEW IF EXISTS student_credit_balance;
DROP TABLE IF EXISTS credit_records;
DROP SEQUENCE IF EXISTS seq_credit;
DELETE FROM audit_logs WHERE action ILIKE '%credit%' OR details ILIKE '%credit%';

-- ===== Part 1: columns the frontend needs =====
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
-- users marked inactive in the old status column can't log in
UPDATE users SET is_active = false WHERE status = 'inactive';

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

-- evidence_documents: leave type + created time
ALTER TABLE evidence_documents
  ADD COLUMN IF NOT EXISTS leave_type varchar(10),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE evidence_documents DROP CONSTRAINT IF EXISTS chk_evidence_leave_type;
ALTER TABLE evidence_documents ADD CONSTRAINT chk_evidence_leave_type
  CHECK (leave_type IS NULL OR leave_type IN ('Medical','Official'));

-- enrollments: backend never sends academic_year, so give it a default
ALTER TABLE enrollments ALTER COLUMN academic_year SET DEFAULT '2026-27';
ALTER TABLE enrollments ALTER COLUMN enrolled_date SET DEFAULT CURRENT_DATE;

-- attendance: backend expects a check-in time
ALTER TABLE attendance ALTER COLUMN "timestamp" SET DEFAULT now();

-- notifications: backend uses the category 'Evidence Documents'
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS chk_notif_category;
ALTER TABLE notifications ADD CONSTRAINT chk_notif_category
  CHECK (category IN ('Attendance','Evidence Documents','System','Reminders'));

-- ===== Part 2: columns for the extra backend features =====
-- users: profile picture + last-updated time
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url varchar(255),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- class_sessions: scheduled -> ongoing -> ended
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'scheduled';
ALTER TABLE class_sessions DROP CONSTRAINT IF EXISTS chk_sessions_status;
ALTER TABLE class_sessions ADD CONSTRAINT chk_sessions_status CHECK (status IN ('scheduled','ongoing','ended'));

-- attendance: where the student checked in from and why it was flagged
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS submitted_lat   double precision,
  ADD COLUMN IF NOT EXISTS submitted_lng   double precision,
  ADD COLUMN IF NOT EXISTS accuracy        double precision,
  ADD COLUMN IF NOT EXISTS distance_meters double precision,
  ADD COLUMN IF NOT EXISTS flag_reason     varchar(100);

-- evidence_documents: uploaded file's original name + when it was reviewed
ALTER TABLE evidence_documents
  ADD COLUMN IF NOT EXISTS original_filename varchar(255),
  ADD COLUMN IF NOT EXISTS reviewed_at       timestamptz;

-- ===== Part 3: departments (from cst.edu.bt) and programme details =====
CREATE SEQUENCE IF NOT EXISTS seq_departments;
CREATE TABLE IF NOT EXISTS departments (
  department_id   varchar(10)  PRIMARY KEY DEFAULT gen_id('D', 'seq_departments'),
  department_code varchar(10)  NOT NULL,
  department_name varchar(100) NOT NULL,
  website         varchar(255),
  created_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT uq_departments_code UNIQUE (department_code),
  CONSTRAINT uq_departments_name UNIQUE (department_name)
);
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

-- each programme belongs to a department; level = Bachelor/Master
ALTER TABLE programs
  ADD COLUMN IF NOT EXISTS department_id  varchar(10),
  ADD COLUMN IF NOT EXISTS level          varchar(10),
  ADD COLUMN IF NOT EXISTS duration_years int;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_programs_department') THEN
    ALTER TABLE programs ADD CONSTRAINT fk_programs_department FOREIGN KEY (department_id)
      REFERENCES departments(department_id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END $$;
ALTER TABLE programs DROP CONSTRAINT IF EXISTS chk_programs_level;
ALTER TABLE programs ADD CONSTRAINT chk_programs_level CHECK (level IS NULL OR level IN ('Bachelor', 'Master'));
CREATE INDEX IF NOT EXISTS idx_programs_department ON programs (department_id);

COMMIT;


-- ===== SEED DATA (real CheckIn data, exported from Supabase on 2026-10-08) =====
-- programs (3 rows)
INSERT INTO programs (program_id, program_name) VALUES
  ('P001', 'B.E. Software Engineering'),
  ('P002', 'B.E. Information Technology'),
  ('P003', 'B.E. Electronics and Communication')
ON CONFLICT DO NOTHING;

-- users (8 rows)
INSERT INTO users (user_id, name, email, password_hash, role, status) VALUES
  ('U001', 'Karma Wangchuk', 'karma.wangchuk@cst.edu.bt', '$2b$10$6dx4kVNg0C27WC2Pj.hxJe.JqR.q4ELH4gmm/HVxZn2fxzci9m4n.', 'admin', 'active'),
  ('U002', 'Sonam Tenzin', 'sonam.tenzin@cst.edu.bt', '$2b$10$6dx4kVNg0C27WC2Pj.hxJe.JqR.q4ELH4gmm/HVxZn2fxzci9m4n.', 'tutor', 'active'),
  ('U003', 'Kinley Dema', 'kinley.dema@cst.edu.bt', '$2b$10$6dx4kVNg0C27WC2Pj.hxJe.JqR.q4ELH4gmm/HVxZn2fxzci9m4n.', 'tutor', 'active'),
  ('U004', 'Tashi Phuntsho', 'tashi.phuntsho@cst.edu.bt', '$2b$10$6dx4kVNg0C27WC2Pj.hxJe.JqR.q4ELH4gmm/HVxZn2fxzci9m4n.', 'student', 'active'),
  ('U005', 'Yangchen Lhamo', 'yangchen.lhamo@cst.edu.bt', '$2b$10$6dx4kVNg0C27WC2Pj.hxJe.JqR.q4ELH4gmm/HVxZn2fxzci9m4n.', 'student', 'active'),
  ('U006', 'Choki Wangdi', 'choki.wangdi@cst.edu.bt', '$2b$10$6dx4kVNg0C27WC2Pj.hxJe.JqR.q4ELH4gmm/HVxZn2fxzci9m4n.', 'student', 'active'),
  ('U007', 'Dorji Pelden', 'dorji.pelden@cst.edu.bt', '$2b$10$6dx4kVNg0C27WC2Pj.hxJe.JqR.q4ELH4gmm/HVxZn2fxzci9m4n.', 'student', 'active'),
  ('U008', 'Dean of Academic Affairs', 'daa@cst.edu.bt', '$2b$10$6dx4kVNg0C27WC2Pj.hxJe.JqR.q4ELH4gmm/HVxZn2fxzci9m4n.', 'management', 'active')
ON CONFLICT DO NOTHING;

-- modules (3 rows)
INSERT INTO modules (module_id, module_code, module_name, program_id) VALUES
  ('M001', 'DBS201', 'Database Systems', 'P001'),
  ('M002', 'NET202', 'Computer Networks', 'P001'),
  ('M003', 'WEB204', 'Web Development', 'P002')
ON CONFLICT DO NOTHING;

-- sections (3 rows)
INSERT INTO sections (section_id, module_id, tutor_id, room, schedule) VALUES
  ('SEC001', 'M001', 'U002', 'B-201', 'Mon & Wed 09:00-10:00'),
  ('SEC002', 'M002', 'U003', 'B-105', 'Mon 11:00-12:00'),
  ('SEC003', 'M003', 'U002', 'Lab-3', 'Tue 14:00-16:00')
ON CONFLICT DO NOTHING;

-- class_sessions (3 rows)
INSERT INTO class_sessions (session_id, section_id, date, start_time, duration) VALUES
  ('S001', 'SEC001', '2026-09-14', '09:00:00', '60'),
  ('S002', 'SEC002', '2026-09-14', '11:00:00', '60'),
  ('S003', 'SEC001', '2026-09-16', '09:00:00', '60')
ON CONFLICT DO NOTHING;

-- attendance_codes (3 rows)
INSERT INTO attendance_codes (session_id, code, expiry_timestamp, geofence_radius, latitude, longitude) VALUES
  ('S001', '482913', '2026-09-14 03:10:00+00', '25', '26.8578', '89.3944'),
  ('S002', '175064', '2026-09-14 05:10:00+00', '25', '26.858', '89.3946'),
  ('S003', '903276', '2026-09-16 03:10:00+00', '25', '26.8578', '89.3944')
ON CONFLICT DO NOTHING;

-- attendance (6 rows)
INSERT INTO attendance (attendance_id, student_id, session_id, "timestamp", status) VALUES
  ('A001', 'U004', 'S001', '2026-09-14 03:02:15+00', 'Present'),
  ('A002', 'U005', 'S001', '2026-09-14 03:08:40+00', 'Late'),
  ('A003', 'U006', 'S001', '2026-09-14 03:05:31+00', 'Flagged'),
  ('A004', 'U004', 'S002', '2026-09-14 05:01:50+00', 'Present'),
  ('A005', 'U007', 'S002', NULL, 'Absent'),
  ('A006', 'U004', 'S003', '2026-09-16 03:03:05+00', 'Present')
ON CONFLICT DO NOTHING;

-- enrollments (5 rows)
INSERT INTO enrollments (student_id, module_id, academic_year, enrolled_date) VALUES
  ('U004', 'M001', '2026-27', '2026-08-10'),
  ('U005', 'M001', '2026-27', '2026-08-10'),
  ('U006', 'M001', '2026-27', '2026-08-11'),
  ('U004', 'M002', '2026-27', '2026-08-10'),
  ('U007', 'M002', '2026-27', '2026-08-12')
ON CONFLICT DO NOTHING;

-- evidence_documents (3 rows)
INSERT INTO evidence_documents (evidence_id, student_id, module_id, date, reason, document_url, status, reviewed_by) VALUES
  ('E001', 'U006', 'M001', '2026-09-14', 'Medical appointment', '/uploads/evidence/E001_medical_certificate.pdf', 'Pending', NULL),
  ('E002', 'U005', 'M001', '2026-09-16', 'Family emergency', '/uploads/evidence/E002_supporting_letter.pdf', 'Approved', 'U002'),
  ('E003', 'U007', 'M002', '2026-09-14', 'Personal reasons', NULL, 'Rejected', 'U003')
ON CONFLICT DO NOTHING;

-- notifications (4 rows)
INSERT INTO notifications (notification_id, user_id, message, category, is_read, created_at) VALUES
  ('N001', 'U005', 'Attendance below 90% in Database Systems.', 'Attendance', 'f', '2026-09-15 02:00:00+00'),
  ('N002', 'U002', 'New evidence document submitted by Choki Wangdi.', 'Evidence Documents', 'f', '2026-09-14 08:20:00+00'),
  ('N003', 'U005', 'Your evidence document E002 has been approved.', 'Evidence Documents', 't', '2026-09-16 10:45:00+00'),
  ('N004', 'U004', 'Reminder: Database Systems class tomorrow at 09:00.', 'Reminders', 'f', '2026-09-15 12:00:00+00')
ON CONFLICT DO NOTHING;

-- audit_logs (3 rows)
INSERT INTO audit_logs (log_id, admin_id, action, details, "timestamp") VALUES
  ('L001', 'U001', 'User Created', 'Created student account U007', '2026-08-12 04:15:00+00'),
  ('L002', 'U001', 'Role Changed', 'Changed U003 role to tutor', '2026-08-05 03:30:00+00'),
  ('L003', 'U001', 'System Setting Updated', 'Default geofence radius set to 25 m', '2026-09-01 05:00:00+00')
ON CONFLICT DO NOTHING;

-- Move ID counters past the seeded IDs so new rows don't clash
SELECT setval('seq_programs', GREATEST((SELECT last_value FROM seq_programs), (SELECT COALESCE(MAX(substring(program_id from '^P([0-9]+)$')::int), 1) FROM programs)));
SELECT setval('seq_users', GREATEST((SELECT last_value FROM seq_users), (SELECT COALESCE(MAX(substring(user_id from '^U([0-9]+)$')::int), 1) FROM users)));
SELECT setval('seq_modules', GREATEST((SELECT last_value FROM seq_modules), (SELECT COALESCE(MAX(substring(module_id from '^M([0-9]+)$')::int), 1) FROM modules)));
SELECT setval('seq_sections', GREATEST((SELECT last_value FROM seq_sections), (SELECT COALESCE(MAX(substring(section_id from '^SEC([0-9]+)$')::int), 1) FROM sections)));
SELECT setval('seq_sessions', GREATEST((SELECT last_value FROM seq_sessions), (SELECT COALESCE(MAX(substring(session_id from '^S([0-9]+)$')::int), 1) FROM class_sessions)));
SELECT setval('seq_attendance', GREATEST((SELECT last_value FROM seq_attendance), (SELECT COALESCE(MAX(substring(attendance_id from '^A([0-9]+)$')::int), 1) FROM attendance)));
SELECT setval('seq_evidence', GREATEST((SELECT last_value FROM seq_evidence), (SELECT COALESCE(MAX(substring(evidence_id from '^E([0-9]+)$')::int), 1) FROM evidence_documents)));
SELECT setval('seq_notif', GREATEST((SELECT last_value FROM seq_notif), (SELECT COALESCE(MAX(substring(notification_id from '^N([0-9]+)$')::int), 1) FROM notifications)));
SELECT setval('seq_audit', GREATEST((SELECT last_value FROM seq_audit), (SELECT COALESCE(MAX(substring(log_id from '^L([0-9]+)$')::int), 1) FROM audit_logs)));

-- Fill the profile fields the frontend uses (only where empty)
UPDATE users u SET programme = p.program_name, department = p.program_name
FROM (SELECT DISTINCT ON (e.student_id) e.student_id, pr.program_name
      FROM enrollments e JOIN modules m ON m.module_id = e.module_id JOIN programs pr ON pr.program_id = m.program_id
      ORDER BY e.student_id, e.enrolled_date) p
WHERE u.user_id = p.student_id AND u.role = 'student' AND u.programme IS NULL;

-- ===== departments + all CST programmes (source: cst.edu.bt, October 2026) =====
INSERT INTO departments (department_id, department_code, department_name, website) VALUES
  ('D001', 'AD',   'Architecture Department',                            'https://ad.cst.edu.bt'),
  ('D002', 'CEED', 'Civil and Environmental Engineering Department',     'https://ceed.cst.edu.bt'),
  ('D003', 'CTD',  'Computing Technologies Department',                  'https://ctd.cst.edu.bt'),
  ('D004', 'EEED', 'Electrical and Electronics Engineering Department',  'https://eeed.cst.edu.bt'),
  ('D005', 'MED',  'Mechanical Engineering Department',                  'https://med.cst.edu.bt'),
  ('D006', 'SHD',  'Science and Humanities Department',                  'https://shd.cst.edu.bt')
ON CONFLICT DO NOTHING;
SELECT setval('seq_departments', GREATEST((SELECT last_value FROM seq_departments), (SELECT COALESCE(MAX(substring(department_id from '^D([0-9]+)$')::int), 1) FROM departments)));

-- add the programmes we don't have yet (matched by name, new IDs come from seq_programs)
INSERT INTO programs (program_name)
SELECT v.name FROM (VALUES
  ('B.E. Civil Engineering'),
  ('B.E. Electrical Engineering'),
  ('Bachelor of Architecture'),
  ('B.E. Engineering Geology'),
  ('B.E. Instrumentation and Control Engineering'),
  ('B.E. Water Resource Engineering'),
  ('B.E. Mechanical Engineering'),
  ('Master of Engineering in Renewable Energy'),
  ('Master in Construction Management'),
  ('Master of Science in Engineering (by Research)')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM programs p WHERE lower(p.program_name) = lower(v.name));

-- link every programme to its department (NULL where the website doesn't say)
UPDATE programs p SET
  department_id  = COALESCE(p.department_id, m.dept),
  level          = COALESCE(p.level, m.lvl),
  duration_years = COALESCE(p.duration_years, m.yrs)
FROM (VALUES
  ('B.E. Software Engineering',                      'D003', 'Bachelor', 4),
  ('B.E. Information Technology',                    'D003', 'Bachelor', 4),
  ('B.E. Civil Engineering',                         'D002', 'Bachelor', 4),
  ('B.E. Engineering Geology',                       'D002', 'Bachelor', 4),
  ('B.E. Water Resource Engineering',                'D002', 'Bachelor', 4),
  ('B.E. Electrical Engineering',                    'D004', 'Bachelor', 4),
  ('B.E. Electronics and Communication',             'D004', 'Bachelor', 4),
  ('B.E. Instrumentation and Control Engineering',   'D004', 'Bachelor', 4),
  ('B.E. Mechanical Engineering',                    'D005', 'Bachelor', 4),
  ('Bachelor of Architecture',                       'D001', 'Bachelor', 5),
  ('Master in Construction Management',              'D002', 'Master',   NULL),
  ('Master of Engineering in Renewable Energy',      NULL,   'Master',   NULL),
  ('Master of Science in Engineering (by Research)', NULL,   'Master',   NULL)
) AS m(name, dept, lvl, yrs)
WHERE lower(p.program_name) = lower(m.name);
