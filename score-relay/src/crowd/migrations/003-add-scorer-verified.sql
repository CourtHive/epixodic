-- Crowd-scoring scorer email-verified flag — Phase D of the crowd-sourced
-- scoring work.
--
-- Carries the hiveid JWT's `email_verified` claim onto the crowd session so
-- TMX can gate scorer-nomination on verified status with no extra lookup
-- (CFS never sees crowd traffic). Unverified HiveID sessions and admin-
-- attributed sessions are stored as FALSE; back-compat rows default FALSE.

ALTER TABLE crowd.crowd_scoring_sessions
  ADD COLUMN IF NOT EXISTS scorer_verified BOOLEAN NOT NULL DEFAULT FALSE;
