-- 0034_badges.sql — Track 38: permanent badge awards. One row per badge_id, so a badge can never
-- be awarded twice and is never taken away. retroactive = found by the startup backfill (never
-- celebrated); seen_at NULL = not yet looked at on the Badges screen. Does not sync (same scope
-- cut as progression_state).

CREATE TABLE earned_badges (
  badge_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'local',
  earned_at TEXT NOT NULL,
  local_date TEXT NOT NULL,
  session_id TEXT,
  retroactive INTEGER NOT NULL DEFAULT 0,
  seen_at TEXT,
  payload TEXT NOT NULL DEFAULT '{}'
);
