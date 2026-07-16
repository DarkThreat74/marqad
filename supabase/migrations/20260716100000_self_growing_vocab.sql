-- Marqad — Self-growing vocabulary + pause data logging
-- Run this in the Supabase SQL Editor or via CLI

-- ============================================================
-- Table 1: vocab_corrections
-- Stores user corrections of misheard words.
-- Each correction is auto-merged into Speechmatics additional_vocab
-- on every future recording session.
-- ============================================================

CREATE TABLE IF NOT EXISTS vocab_corrections (
  id uuid primary key default gen_random_uuid(),
  wrong_text text not null,
  correct_text text not null,
  sounds_like text[] not null default '{}',
  times_confirmed int not null default 1,
  first_added_at timestamptz not null default now(),
  last_confirmed_at timestamptz not null default now(),
  source_date date,
  source_slot int
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vocab_corrections_correct_text
  ON vocab_corrections (correct_text);

-- Enable RLS with permissive policies (single-user personal tool, no auth)
ALTER TABLE vocab_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read vocab_corrections" ON vocab_corrections;
CREATE POLICY "anon read vocab_corrections"
  ON vocab_corrections FOR SELECT
  TO anon USING (true);

DROP POLICY IF EXISTS "anon insert vocab_corrections" ON vocab_corrections;
CREATE POLICY "anon insert vocab_corrections"
  ON vocab_corrections FOR INSERT
  TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon update vocab_corrections" ON vocab_corrections;
CREATE POLICY "anon update vocab_corrections"
  ON vocab_corrections FOR UPDATE
  TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon delete vocab_corrections" ON vocab_corrections;
CREATE POLICY "anon delete vocab_corrections"
  ON vocab_corrections FOR DELETE
  TO anon USING (true);

-- ============================================================
-- Table 2: pause_observations
-- Passively logs every measured pause duration during recording.
-- This is DATA COLLECTION ONLY — not consumed automatically.
-- Exists so a human can later query it to inform manual tuning of
-- end_of_utterance_silence_trigger and tier thresholds.
-- ============================================================

CREATE TABLE IF NOT EXISTS pause_observations (
  id uuid primary key default gen_random_uuid(),
  class_date date not null,
  slot_number int not null,
  pause_ms int not null,
  pause_tier text not null,
  was_edited boolean not null default false,
  edit_type text,
  recorded_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_pause_observations_date
  ON pause_observations (class_date);

ALTER TABLE pause_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read pause_observations" ON pause_observations;
CREATE POLICY "anon read pause_observations"
  ON pause_observations FOR SELECT
  TO anon USING (true);

DROP POLICY IF EXISTS "anon insert pause_observations" ON pause_observations;
CREATE POLICY "anon insert pause_observations"
  ON pause_observations FOR INSERT
  TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon update pause_observations" ON pause_observations;
CREATE POLICY "anon update pause_observations"
  ON pause_observations FOR UPDATE
  TO anon USING (true) WITH CHECK (true);
