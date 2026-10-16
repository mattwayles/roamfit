-- 0028_accessory_micro.sql — an accessory (a main exercise with no progression family) now climbs
-- the same micro-progression ladder a family does, tracked per exercise. Its band is the existing
-- working_band (0027); these hold the rest of the ladder position. NULL micro_rep_target = not on
-- the ladder yet: the exercise is prescribed off the day's difficulty table until it first
-- completes as an accessory. Exercises already trained as accessories are seeded from history in
-- TypeScript (seedAccessoryProgressionFromHistory), since the seed applies engine rules.

ALTER TABLE exercise_state ADD COLUMN micro_rep_target INTEGER;
ALTER TABLE exercise_state ADD COLUMN micro_tempo_sec INTEGER;
ALTER TABLE exercise_state ADD COLUMN micro_rest_sec INTEGER;
ALTER TABLE exercise_state ADD COLUMN micro_sets INTEGER;
ALTER TABLE exercise_state ADD COLUMN micro_consecutive_misses INTEGER NOT NULL DEFAULT 0;
