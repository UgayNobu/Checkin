-- Things Supabase has that `prisma db push` does not create.
-- Runs after `prisma db push` on a fresh local/CI database only (see db-setup.sh). Safe to re-run.

-- A current semester: new sections and enrolments (incl. the seed) take their academic_session from it
INSERT INTO academic_sessions (session_code, name, term, start_date, end_date, is_current)
SELECT 'AS2026', 'Autumn Semester 2026', 'autumn', DATE '2026-07-27', DATE '2026-12-06', true
WHERE NOT EXISTS (SELECT 1 FROM academic_sessions);

-- Partial / expression unique indexes (Prisma can't describe these)
CREATE UNIQUE INDEX IF NOT EXISTS uq_acs_one_current ON academic_sessions (is_current) WHERE is_current;
CREATE UNIQUE INDEX IF NOT EXISTS uq_modules_enrolment_key ON modules (lower(enrolment_key)) WHERE enrolment_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_slots_natural ON timetable_slots
  (program_id, year, academic_session, day_of_week, start_time, module_code, session_type, (COALESCE(group_label, '')));
CREATE UNIQUE INDEX IF NOT EXISTS uq_cc_slot_date ON class_changes (slot_id, class_date) WHERE slot_id IS NOT NULL;
