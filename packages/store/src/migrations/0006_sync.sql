-- 0006_sync.sql — §11.3 Firestore sync substrate (track 6d).
--
-- remote_video_config: local mirror of the `video/{exercise_id}` Firestore remote-config
-- collection (§4.1's remote-config block, §11.4). Pulled, never pushed by the app — an operator
-- (video_db.py, track 6e) is the only writer on the Firestore side. This is what supplies a real
-- `curatedVideoId` at the WorkoutScreen media-ladder call site instead of the hard-coded `null`
-- 6b left behind (issue #29/#30).
--
-- sync_cursor: a small generic key/value table for "how far has each sync pass gotten" —
-- e.g. the delta-pull watermark for remote_video_config, and the push watermark for the
-- append-only `sessions` push. Deliberately not reusing `deferred_work` for this: deferred_work
-- models discrete one-shot jobs (§11.3's LLM/healthkit/geocode queues); a sync cursor is
-- continuous incremental state, a different shape.

CREATE TABLE remote_video_config (
  exercise_id TEXT PRIMARY KEY,
  video_id TEXT,
  video_verified_at TEXT,
  video_flag_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE sync_cursor (
  name TEXT PRIMARY KEY,
  value TEXT
);
