-- Marqad — Class Periods table + title column on sessions
-- Stores user-configurable class periods for automatic session naming.
-- When a recording starts, the start time is matched against these periods
-- to generate a default session title like "Period 5 - Qiraat - July 17".

CREATE TABLE IF NOT EXISTS marqad_class_periods (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL DEFAULT 'marqad-user',
  period_number int NOT NULL,
  class_name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_number)
);

CREATE INDEX IF NOT EXISTS idx_marqad_class_periods_user
  ON marqad_class_periods (user_id, period_number);

-- Enable RLS with permissive policies (single-user personal tool, no auth)
ALTER TABLE marqad_class_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read marqad_class_periods" ON marqad_class_periods;
CREATE POLICY "anon read marqad_class_periods"
  ON marqad_class_periods FOR SELECT
  TO anon USING (true);

DROP POLICY IF EXISTS "anon insert marqad_class_periods" ON marqad_class_periods;
CREATE POLICY "anon insert marqad_class_periods"
  ON marqad_class_periods FOR INSERT
  TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon update marqad_class_periods" ON marqad_class_periods;
CREATE POLICY "anon update marqad_class_periods"
  ON marqad_class_periods FOR UPDATE
  TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon delete marqad_class_periods" ON marqad_class_periods;
CREATE POLICY "anon delete marqad_class_periods"
  ON marqad_class_periods FOR DELETE
  TO anon USING (true);

-- Seed the 8 default class periods
INSERT INTO marqad_class_periods (user_id, period_number, class_name, start_time, end_time)
VALUES
  ('marqad-user', 1, 'Mishkat 1',       '07:30', '08:10'),
  ('marqad-user', 2, 'Sharh al Wiqayah', '08:15', '08:55'),
  ('marqad-user', 3, 'Hidayah 1',       '09:00', '09:40'),
  ('marqad-user', 4, 'Nur al Anwar',    '09:55', '10:25'),
  ('marqad-user', 5, 'Qiraat',          '10:40', '11:20'),
  ('marqad-user', 6, 'Iqtisad',         '11:25', '12:05'),
  ('marqad-user', 7, 'Jalalayan',       '12:40', '13:20'),
  ('marqad-user', 8, 'Hadith',          '14:35', '15:15')
ON CONFLICT (user_id, period_number) DO NOTHING;

-- Add title column to marqad_sessions for custom session names
ALTER TABLE marqad_sessions
  ADD COLUMN IF NOT EXISTS title text;
