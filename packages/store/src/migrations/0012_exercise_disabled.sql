-- 0012_exercise_disabled.sql — explicit, permanent user veto on an exercise, distinct from
-- `suppressed_until` (temporary, system-managed §5.2/§13.2 cooldown). Set from the Exercises
-- detail screen or the workout approval screen; cleared only by explicitly re-enabling.
-- Lives on exercise_state (per user x exercise, invariant 7) — same shape as every other
-- per-exercise user toggle already there. NULL = eligible, which is correct for every
-- existing row.

ALTER TABLE exercise_state ADD COLUMN disabled_at TEXT;
