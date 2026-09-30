-- 0021_session_resting.sql — the rest page currently on screen, made real.
--
-- Which set the user just finished and is now resting after used to be a component-local
-- `useState` on the workout screen (`phase`/`restingEntryId`/`restingSetIndex`), which meant it
-- was lost the moment the screen unmounted — including the "Progress" button, which `replace`s
-- Workout with Summary. Coming back from Summary always re-derived the front edge (the *next*
-- not-yet-logged set) and landed on its exercise page, silently skipping the rest the user was
-- still on.
--
-- `resting_entry_id`/`resting_set_index` are that same pair, persisted; `resting_started_at` is
-- the instant the rest began, so the countdown can resume with the correct remaining time instead
-- of restarting at the full prescribed rest. NULL means not currently resting — display and
-- resume both fall back to the derived front edge, exactly as before these columns existed.

ALTER TABLE sessions ADD COLUMN resting_entry_id TEXT;
ALTER TABLE sessions ADD COLUMN resting_set_index INTEGER;
ALTER TABLE sessions ADD COLUMN resting_started_at TEXT;
