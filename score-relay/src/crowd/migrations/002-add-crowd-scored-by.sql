-- Crowd-scoring HiveID attribution — Phase 5 of the HiveID integration.
--
-- When a HiveID-authenticated visitor submits crowd scores on
-- courthive-public, score-relay records the scorer's canonical Person
-- identity here so a future promote-to-trusted step can stamp
-- `crowdScoredBy.personId` on the matchUp at CFS. Admin sessions may
-- also carry an attribution (TD scoring on behalf of someone);
-- anonymous / legacy admin sessions leave all three columns NULL —
-- back-compat preserved.

ALTER TABLE crowd.crowd_scoring_sessions
  ADD COLUMN IF NOT EXISTS scorer_person_id    TEXT,
  ADD COLUMN IF NOT EXISTS scorer_display_name TEXT,
  ADD COLUMN IF NOT EXISTS scorer_audience     TEXT;

-- Lookup "all sessions by this Person" for the eventual merge / promote
-- path. Partial index keeps the cost off non-attributed sessions.
CREATE INDEX IF NOT EXISTS idx_crowd_scorer_person
  ON crowd.crowd_scoring_sessions (scorer_person_id)
  WHERE scorer_person_id IS NOT NULL;
