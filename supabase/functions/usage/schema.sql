-- Marqad usage tracking table
-- Run this in the Supabase SQL Editor to create the table

CREATE TABLE IF NOT EXISTS marqad_usage (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id TEXT NOT NULL,
  month_key TEXT NOT NULL, -- format: YYYY-MM
  seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, month_key)
);

-- Enable RLS (we use the service role key in the edge function, which bypasses RLS)
ALTER TABLE marqad_usage ENABLE ROW LEVEL SECURITY;

-- No policies needed — the edge function uses the service role key
-- which bypasses RLS entirely.
