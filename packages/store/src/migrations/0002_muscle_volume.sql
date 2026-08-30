-- 0002_muscle_volume.sql — §14.3/§5.2 per-session muscle-set ledger, added after 0001 to prove
-- the migration mechanism actually evolves the schema rather than only ever running once.

CREATE TABLE session_muscle_volume (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  muscle TEXT NOT NULL,
  sets REAL NOT NULL,
  hard_sets REAL NOT NULL DEFAULT 0
);
CREATE INDEX ix_session_muscle_volume_session ON session_muscle_volume(session_id);
CREATE INDEX ix_session_muscle_volume_local_date ON session_muscle_volume(local_date);
