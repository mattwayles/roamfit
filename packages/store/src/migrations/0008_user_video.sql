-- 0008_user_video.sql — §11.4 / ADR 0009: a user-assigned YouTube video per exercise, entered
-- from the workout screen. Lives on exercise_state (per user × exercise, invariant 7) and
-- deliberately NOT on remote_video_config: that table is pull-only from Firestore, so a local
-- write there would be silently clobbered by the next delta sync. Separate columns also keep the
-- two sources distinguishable, which is what lets the ladder prefer the user's own pick over a
-- curated id without losing the curated one underneath.
--
-- Nullable with no default: NULL means "the user has not assigned one", which is the correct
-- state for every existing row and every exercise never opened.

ALTER TABLE exercise_state ADD COLUMN user_video_id TEXT;
ALTER TABLE exercise_state ADD COLUMN user_video_assigned_at TEXT;
