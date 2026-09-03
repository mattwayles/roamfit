-- 0013_effort_to_difficulty.sql — the session-level "Effort" dial is retired; the app now asks
-- for a "Difficulty" that reuses the exercise library's own difficulty scale, so its middle value
-- renames from 'normal' to 'medium' to match. Both columns stay physically named `effort` —
-- schema.ts maps them to a `difficulty` field; a same-shape value rename isn't worth an
-- ALTER TABLE RENAME COLUMN, unprecedented in this schema.

UPDATE sessions SET effort = 'medium' WHERE effort = 'normal';
UPDATE session_entries SET effort = 'medium' WHERE effort = 'normal';
