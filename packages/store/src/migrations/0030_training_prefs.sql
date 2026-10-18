-- 0030_training_prefs.sql — Track 37f: the user's training preferences (goal, rest, variety,
-- recovery, progression pace, warm-up length) as one JSON object. '{}' means every default, and the
-- defaults reproduce the engine's behaviour from before preferences existed, so existing installs
-- see no change until they choose one. micro_consecutive_hits banks qualifying sessions on an
-- accessory's own ladder under the "patient" pace (always 0 at the default pace).

ALTER TABLE users ADD COLUMN training_prefs TEXT NOT NULL DEFAULT '{}';
ALTER TABLE exercise_state ADD COLUMN micro_consecutive_hits INTEGER NOT NULL DEFAULT 0;
