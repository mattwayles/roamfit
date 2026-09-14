-- 0020_remove_calibration.sql — calibration mode is gone. A new user now starts at level 1 and
-- moves only by meeting/missing the ordinary prescription or an explicit "too easy — level up" /
-- "too hard — level down" tap on the progression board. `calibrating` no longer means anything to
-- either the engine or the app, so the column is dropped rather than left as dead weight (same
-- call as 0018_remove_enjoyment.sql).

ALTER TABLE progression_state DROP COLUMN calibrating;
