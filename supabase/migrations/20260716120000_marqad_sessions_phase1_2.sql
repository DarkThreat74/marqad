-- Marqad — Phase 1 & 2: Add batch model metadata + AI reasoning + reconciliation columns
-- Extends marqad_sessions to support:
--   Phase 1: batch_model (which Speechmatics model), batch_words (per-word JSON with confidence)
--   Phase 2: ai_reasoning_transcript/at (Gemini independent pass), reconciled_transcript/at (merged result)
-- All new columns are nullable — existing rows are unaffected.

ALTER TABLE marqad_sessions
  ADD COLUMN IF NOT EXISTS batch_model text,
  ADD COLUMN IF NOT EXISTS batch_words jsonb,
  ADD COLUMN IF NOT EXISTS ai_reasoning_transcript text,
  ADD COLUMN IF NOT EXISTS ai_reasoning_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciled_transcript text,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;
