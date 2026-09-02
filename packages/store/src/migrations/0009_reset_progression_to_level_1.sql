-- 0009_reset_progression_to_level_1.sql — ADR 0012.
-- Every family used to be seeded at ~the 30th percentile of its ladder (§6.5); the cold start is
-- now level 1. Existing rows still point at the old mid-ladder placement, so this clears them.
--
-- Deleting rather than UPDATE-ing to a literal level_id is deliberate: SQL has no knowledge of
-- the ladders, and hardcoding "<family>.l1" here would duplicate ladder structure into a
-- migration where it could silently drift from families.json. `ensureProgressionStatesInitialized`
-- re-seeds every missing family on the next generation, taking both the level and its micro-state
-- from the engine — which keeps invariant 2 intact and means this migration cannot encode a
-- wrong starting level even if the ladders change later.
--
-- exercise_state is deliberately untouched: enjoyment EMAs, skip/swap counts, best sets and
-- user-assigned videos are all still true, and none of them describe a ladder position.

DELETE FROM progression_state;
