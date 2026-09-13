-- 0018_remove_enjoyment.sql — the enjoyment dimension of feedback is gone, not just unused.
--
-- Set feedback is difficulty only now (too_easy / just_right / too_hard) — enjoyment (the 1-5
-- rating) never earned its keep as a second axis and its removal reaches further than the UI: it
-- also drove exercise-selection behavior (avoiding disliked exercises, capping how often
-- "favorites" got picked, breaking swap-alternative ties), all removed from the engine in the
-- same change. Nothing reads or writes these three columns any more, so they are dropped rather
-- than left as permanent dead weight.

ALTER TABLE exercise_state DROP COLUMN enjoyment_ema;
ALTER TABLE session_entries DROP COLUMN enjoyment_feedback;
ALTER TABLE set_logs DROP COLUMN enjoyment_feedback;
