-- 0038_remove_firebase.sql — Firebase is gone from the app (no Firestore sync, no LLM proxy), so
-- the tables that only served it are dropped rather than left as dead weight (same call as
-- 0018_remove_enjoyment.sql): `remote_video_config` (the pull-only mirror of Firestore's curated
-- video ids) and `sync_cursor` (the sync watermarks). Queued LLM jobs can never run now, so any
-- still pending are deleted.

DROP TABLE remote_video_config;
DROP TABLE sync_cursor;
DELETE FROM deferred_work WHERE kind IN ('llm_distillation', 'llm_coach_voice');
