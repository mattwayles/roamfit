-- 0017_set_level_feedback.sql — main-exercise feedback moves from the entry to the set.
--
-- difficulty_feedback/enjoyment_feedback on session_entries assumed one answer covered every set
-- of an exercise, which is only true for warm-up/cool-down (judged as a block, one question per
-- stage). A `main` exercise can genuinely feel different set to set — a band bumped up between
-- sets, fatigue setting in by set 3 — so its feedback now lives per set_logs row instead. The
-- session_entries columns stay (warm-up/cool-down still share one answer, written there via
-- recordSectionFeedback); a main entry just no longer uses them.

ALTER TABLE set_logs ADD COLUMN difficulty_feedback TEXT;
ALTER TABLE set_logs ADD COLUMN enjoyment_feedback INTEGER;
