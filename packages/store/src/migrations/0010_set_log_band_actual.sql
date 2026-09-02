-- 0010_set_log_band_actual.sql — which band the user actually picked up for one set.
--
-- session_entries.band is the *prescription* (what the engine planned, editable at approval), and
-- it stays that way — planned-vs-actual is preserved, never overwritten, exactly as it is for
-- exercise_id/planned_exercise_id. The band actually trained with is a per-set fact: a user who
-- starts a set on B2 and finishes the next two on B3 has told us something real, and averaging
-- that into one per-entry column would lose it.
--
-- NULL means "no correction reported" — every existing row, every bodyweight set, and every set
-- where the prescription was simply followed. Completion reads this back to decide what band the
-- next session should be built around (see `reconcileMicroToObservedBand` in the engine).

ALTER TABLE set_logs ADD COLUMN band_actual TEXT;
