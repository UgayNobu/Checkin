-- Columns that exist in Supabase and are used by the seed data, but are not in schema.prisma.
-- Runs after `prisma db push` on a fresh local/CI database only.
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS academic_year varchar(10) DEFAULT '2026-27';
