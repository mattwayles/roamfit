-- 0011_session_pause.sql — the workout-level pause, made real.
--
-- Pausing used to be a component-local `useState` on the workout screen, which meant two things:
-- the elapsed timer kept counting while "paused" (it was derived from `started_at` alone, with
-- nothing to subtract), and the pause was lost the moment the screen unmounted — which is exactly
-- what pausing did, since it navigated away.
--
-- `paused_at` is the instant the currently-open pause began (NULL = running), and
-- `paused_total_sec` banks every pause already closed. Elapsed is then
-- `now - started_at - paused_total_sec - (now - paused_at)`, which is suspension-proof for the
-- same reason the countdown controllers are: it re-derives from absolute instants rather than
-- counting ticks. Defaults mean every existing session reads as "never paused", which is true.

ALTER TABLE sessions ADD COLUMN paused_at TEXT;
ALTER TABLE sessions ADD COLUMN paused_total_sec INTEGER NOT NULL DEFAULT 0;
