-- 0015_manual_day_markers.sql — §14.1.6 calendar heatmap: lets the user re-tag one day's marker
-- by hand (no workout / travel day / a focus letter), for a workout that happened outside
-- RoamFit or a travel day that went unlogged. Per user x local_date (invariant 7's per-user-state
-- shape, keyed by date instead of exercise/family), one row per day, last-write-wins on a re-edit
-- rather than an appended history. Never touches `sessions` or `signal_events` — the marker is
-- display-only.

CREATE TABLE manual_day_markers (
  user_id TEXT NOT NULL DEFAULT 'local',
  local_date TEXT NOT NULL,
  marker TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_manual_day_markers_user_date ON manual_day_markers(user_id, local_date);
