-- Objects that exist in Supabase but are not created by `prisma db push`.
-- Used ONLY to build a fresh local/CI database (see db-setup.sh). Safe to re-run.

-- ID generator used by the table defaults, e.g. gen_id('U', 'seq_users') -> 'U001'
CREATE OR REPLACE FUNCTION gen_id(prefix text, seq text) RETURNS text
LANGUAGE sql AS $$
  SELECT prefix || lpad(n::text, GREATEST(3, length(n::text)), '0')
  FROM (SELECT nextval(seq::regclass) AS n) s
$$;

CREATE SEQUENCE IF NOT EXISTS seq_departments;
CREATE SEQUENCE IF NOT EXISTS seq_programs;
CREATE SEQUENCE IF NOT EXISTS seq_users;
CREATE SEQUENCE IF NOT EXISTS seq_modules;
CREATE SEQUENCE IF NOT EXISTS seq_sections;
CREATE SEQUENCE IF NOT EXISTS seq_sessions;
CREATE SEQUENCE IF NOT EXISTS seq_attendance;
CREATE SEQUENCE IF NOT EXISTS seq_evidence;
CREATE SEQUENCE IF NOT EXISTS seq_notif;
CREATE SEQUENCE IF NOT EXISTS seq_audit;
CREATE SEQUENCE IF NOT EXISTS seq_rooms;
CREATE SEQUENCE IF NOT EXISTS seq_slots;
