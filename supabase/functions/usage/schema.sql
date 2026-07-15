-- Marqad usage tracking table
-- Run this in the Supabase SQL Editor to create the table and function

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

-- Atomic increment function — avoids race conditions
CREATE OR REPLACE FUNCTION add_usage_seconds(p_user_id TEXT, p_month_key TEXT, p_seconds INTEGER)
RETURNS INTEGER AS $$
DECLARE
  new_total INTEGER;
BEGIN
  INSERT INTO marqad_usage (user_id, month_key, seconds)
  VALUES (p_user_id, p_month_key, p_seconds)
  ON CONFLICT (user_id, month_key)
  DO UPDATE SET seconds = marqad_usage.seconds + p_seconds, updated_at = NOW()
  RETURNING seconds INTO new_total;
  RETURN new_total;
END;
$$ LANGUAGE plpgsql;

