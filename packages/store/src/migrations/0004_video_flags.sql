-- 0004_video_flags.sql — §11.4 link-health local state: two video-quality flags (user reports
-- and/or automatic player-error flags, sharing one counter — see STATUS-6b-media-ladder.md)
-- demote an exercise's media ladder off the curated embed until a human re-curates.
-- Lives on exercise_state (per user x exercise, invariant 7) rather than a new table because it
-- is exactly that shape and exercise_state already has the ensure-row-on-first-write pattern this
-- needs.

ALTER TABLE exercise_state ADD COLUMN video_flag_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exercise_state ADD COLUMN video_demoted_at TEXT;
