-- 0016_session_cursor.sql — a persisted "you are here" override.
--
-- "You are here" used to be purely derived: the first not-yet-logged set, re-walked from
-- set_logs on every read (see findCurrentEntry). That is still what decides whether the workout
-- is *done*. But tapping a set from Summary is a user selection, not a crash-safety resume, and
-- it needs to survive leaving the screen: `cursor_entry_id`/`cursor_set_index` is where that
-- selection is now written. NULL means no override — everything falls back to the derived front
-- edge, exactly as before this column existed.

ALTER TABLE sessions ADD COLUMN cursor_entry_id TEXT;
ALTER TABLE sessions ADD COLUMN cursor_set_index INTEGER;
