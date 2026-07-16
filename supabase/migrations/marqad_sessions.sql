-- Marqad — Sessions table (transcripts + audio metadata)
-- Stores all transcription sessions in the database so they persist
-- across devices and browsers. Audio files are stored in Supabase
-- Storage bucket 'marqad-audio' and referenced by path here.

CREATE TABLE IF NOT EXISTS marqad_sessions (
  id text primary key,
  user_id text not null default 'marqad-user',
  date timestamptz not null default now(),
  duration_sec int not null default 0,
  segment_count int not null default 0,
  preview text not null default '',
  export_text text not null default '',
  audio_path text,
  audio_size int,
  audio_format text default 'webm',
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_marqad_sessions_user_date
  ON marqad_sessions (user_id, date DESC);

-- Enable RLS with permissive policies (single-user personal tool, no auth)
ALTER TABLE marqad_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read marqad_sessions" ON marqad_sessions;
CREATE POLICY "anon read marqad_sessions"
  ON marqad_sessions FOR SELECT
  TO anon USING (true);

DROP POLICY IF EXISTS "anon insert marqad_sessions" ON marqad_sessions;
CREATE POLICY "anon insert marqad_sessions"
  ON marqad_sessions FOR INSERT
  TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon update marqad_sessions" ON marqad_sessions;
CREATE POLICY "anon update marqad_sessions"
  ON marqad_sessions FOR UPDATE
  TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon delete marqad_sessions" ON marqad_sessions;
CREATE POLICY "anon delete marqad_sessions"
  ON marqad_sessions FOR DELETE
  TO anon USING (true);

-- Storage bucket for audio files
-- Created via Supabase dashboard or CLI:
-- supabase storage create bucket marqad-audio --public
-- Or run this in the SQL editor:
INSERT INTO storage.buckets (id, name, public)
VALUES ('marqad-audio', 'marqad-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies — allow anon to read/write/delete
DROP POLICY IF EXISTS "anon upload marqad-audio" ON storage.objects;
CREATE POLICY "anon upload marqad-audio"
  ON storage.objects FOR INSERT
  TO anon WITH CHECK (bucket_id = 'marqad-audio');

DROP POLICY IF EXISTS "anon read marqad-audio" ON storage.objects;
CREATE POLICY "anon read marqad-audio"
  ON storage.objects FOR SELECT
  TO anon USING (bucket_id = 'marqad-audio');

DROP POLICY IF EXISTS "anon delete marqad-audio" ON storage.objects;
CREATE POLICY "anon delete marqad-audio"
  ON storage.objects FOR DELETE
  TO anon USING (bucket_id = 'marqad-audio');
