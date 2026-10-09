-- Real CheckIn data (exported from the Supabase DB on 2026-10-08).
-- Safe to re-run: existing rows are skipped (ON CONFLICT DO NOTHING).

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

-- relief_requests (3 rows)
INSERT INTO relief_requests (request_id, student_id, module_id, date, reason, document_url, status, reviewed_by) VALUES
  ('R001', 'U006', 'M001', '2026-09-14', 'Medical appointment', '/uploads/relief/R001_medical_certificate.pdf', 'Pending', NULL),
  ('R002', 'U005', 'M001', '2026-09-16', 'Family emergency', '/uploads/relief/R002_supporting_letter.pdf', 'Approved', 'U002'),
  ('R003', 'U007', 'M002', '2026-09-14', 'Personal reasons', NULL, 'Rejected', 'U003')
ON CONFLICT DO NOTHING;

-- credit_records (3 rows)
INSERT INTO credit_records (credit_id, student_id, points, reason, awarded_by, date) VALUES
  ('C001', 'U004', '5', 'Perfect attendance - week 2 of September', 'U001', '2026-09-18'),
  ('C002', 'U005', '3', 'Consistent early check-in', 'U001', '2026-09-18'),
  ('C003', 'U007', '2', 'Class participation', 'U001', '2026-09-18')
ON CONFLICT DO NOTHING;

-- notifications (4 rows)
INSERT INTO notifications (notification_id, user_id, message, category, is_read, created_at) VALUES
  ('N001', 'U005', 'Attendance below 90% in Database Systems.', 'Attendance', 'f', '2026-09-15 02:00:00+00'),
  ('N002', 'U002', 'New relief request submitted by Choki Wangdi.', 'Relief Requests', 'f', '2026-09-14 08:20:00+00'),
  ('N003', 'U005', 'Your relief request R002 has been approved.', 'Relief Requests', 't', '2026-09-16 10:45:00+00'),
  ('N004', 'U004', 'Reminder: Database Systems class tomorrow at 09:00.', 'Reminders', 'f', '2026-09-15 12:00:00+00')
ON CONFLICT DO NOTHING;

-- audit_logs (4 rows)
INSERT INTO audit_logs (log_id, admin_id, action, details, "timestamp") VALUES
  ('L001', 'U001', 'User Created', 'Created student account U007', '2026-08-12 04:15:00+00'),
  ('L002', 'U001', 'Role Changed', 'Changed U003 role to tutor', '2026-08-05 03:30:00+00'),
  ('L003', 'U001', 'System Setting Updated', 'Default geofence radius set to 25 m', '2026-09-01 05:00:00+00'),
  ('L004', 'U001', 'Credits Awarded', 'Awarded 5 points to U004', '2026-09-18 06:10:00+00')
ON CONFLICT DO NOTHING;

-- Move ID counters past the seeded IDs so new rows don't clash
SELECT setval('seq_programs', GREATEST((SELECT last_value FROM seq_programs), (SELECT COALESCE(MAX(substring(program_id from '^P([0-9]+)$')::int), 1) FROM programs)));
SELECT setval('seq_users', GREATEST((SELECT last_value FROM seq_users), (SELECT COALESCE(MAX(substring(user_id from '^U([0-9]+)$')::int), 1) FROM users)));
SELECT setval('seq_modules', GREATEST((SELECT last_value FROM seq_modules), (SELECT COALESCE(MAX(substring(module_id from '^M([0-9]+)$')::int), 1) FROM modules)));
SELECT setval('seq_sections', GREATEST((SELECT last_value FROM seq_sections), (SELECT COALESCE(MAX(substring(section_id from '^SEC([0-9]+)$')::int), 1) FROM sections)));
SELECT setval('seq_sessions', GREATEST((SELECT last_value FROM seq_sessions), (SELECT COALESCE(MAX(substring(session_id from '^S([0-9]+)$')::int), 1) FROM class_sessions)));
SELECT setval('seq_attendance', GREATEST((SELECT last_value FROM seq_attendance), (SELECT COALESCE(MAX(substring(attendance_id from '^A([0-9]+)$')::int), 1) FROM attendance)));
SELECT setval('seq_relief', GREATEST((SELECT last_value FROM seq_relief), (SELECT COALESCE(MAX(substring(request_id from '^R([0-9]+)$')::int), 1) FROM relief_requests)));
SELECT setval('seq_credit', GREATEST((SELECT last_value FROM seq_credit), (SELECT COALESCE(MAX(substring(credit_id from '^C([0-9]+)$')::int), 1) FROM credit_records)));
SELECT setval('seq_notif', GREATEST((SELECT last_value FROM seq_notif), (SELECT COALESCE(MAX(substring(notification_id from '^N([0-9]+)$')::int), 1) FROM notifications)));
SELECT setval('seq_audit', GREATEST((SELECT last_value FROM seq_audit), (SELECT COALESCE(MAX(substring(log_id from '^L([0-9]+)$')::int), 1) FROM audit_logs)));

-- Fill the profile fields the frontend uses (only where empty)
UPDATE users u SET programme = p.program_name, department = p.program_name
FROM (SELECT DISTINCT ON (e.student_id) e.student_id, pr.program_name
      FROM enrollments e JOIN modules m ON m.module_id = e.module_id JOIN programs pr ON pr.program_id = m.program_id
      ORDER BY e.student_id, e.enrolled_date) p
WHERE u.user_id = p.student_id AND u.role = 'student' AND u.programme IS NULL;
