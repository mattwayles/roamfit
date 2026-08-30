-- 0001_init.sql — initial schema. See ../schema.ts for the authoritative field-by-field
-- rationale and the spec.md section each table maps to. Keep this file and schema.ts in sync by
-- hand; there is no drizzle-kit codegen wired up (deliberately — the schema is still coarse
-- enough that hand-authored, reviewable migrations are cheaper than reconciling generated diffs).

CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT 'local',
  units TEXT NOT NULL DEFAULT 'lb',
  band_tensions TEXT NOT NULL DEFAULT '{}',
  weekly_target INTEGER NOT NULL DEFAULT 3,
  anchors_available TEXT NOT NULL,
  passport_enabled INTEGER NOT NULL DEFAULT 0,
  health_write_enabled INTEGER NOT NULL DEFAULT 0,
  notification_prefs TEXT NOT NULL DEFAULT '{}',
  last_known_tz_id TEXT,
  has_ever_completed_session INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE limitations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'local',
  tag TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL,
  expires_at TEXT
);
CREATE INDEX ix_limitations_user ON limitations(user_id);

CREATE TABLE exercise_state (
  user_id TEXT NOT NULL DEFAULT 'local',
  exercise_id TEXT NOT NULL,
  last_performed_at TEXT,
  sessions_performed INTEGER NOT NULL DEFAULT 0,
  best_set_reps INTEGER,
  best_set_seconds INTEGER,
  best_set_band TEXT,
  best_set_at TEXT,
  difficulty_ema REAL NOT NULL DEFAULT 0,
  enjoyment_ema REAL NOT NULL DEFAULT 3,
  skip_count INTEGER NOT NULL DEFAULT 0,
  swap_away_count INTEGER NOT NULL DEFAULT 0,
  remove_at_approval_count INTEGER NOT NULL DEFAULT 0,
  pinned_note TEXT,
  suppressed_until TEXT,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_exercise_state_user_exercise ON exercise_state(user_id, exercise_id);

CREATE TABLE progression_state (
  user_id TEXT NOT NULL DEFAULT 'local',
  family_id TEXT NOT NULL,
  level_id TEXT NOT NULL,
  micro TEXT NOT NULL,
  calibrating INTEGER NOT NULL DEFAULT 1,
  consecutive_hits INTEGER NOT NULL DEFAULT 0,
  consecutive_misses INTEGER NOT NULL DEFAULT 0,
  last_level_change_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_progression_state_user_family ON progression_state(user_id, family_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'local',
  status TEXT NOT NULL,
  pending_slot INTEGER,
  utc_instant TEXT NOT NULL,
  local_date TEXT NOT NULL,
  tz_id TEXT NOT NULL,
  focus TEXT NOT NULL,
  effort TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'straight_sets',
  target_minutes INTEGER NOT NULL,
  estimated_minutes INTEGER NOT NULL,
  actual_minutes REAL,
  anchors_snapshot TEXT NOT NULL,
  explanation TEXT NOT NULL,
  pattern_gaps TEXT NOT NULL DEFAULT '[]',
  time_budget_deviation TEXT,
  retrospective TEXT,
  city TEXT,
  country TEXT,
  generated_by TEXT NOT NULL DEFAULT 'engine',
  engine_version TEXT NOT NULL,
  comeback_tier TEXT NOT NULL DEFAULT 'none',
  recovery_week_manual INTEGER NOT NULL DEFAULT 0,
  abandoned_entry_id TEXT,
  abandoned_set_index INTEGER,
  regenerate_tap_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  discarded_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- §10.10 hard invariant: only one pending (planned|active) session may exist. pending_slot is
-- app-maintained (1 while pending, NULL otherwise); this partial unique index makes a second one
-- a constraint violation, not just an application-level check.
CREATE UNIQUE INDEX ux_sessions_pending_slot ON sessions(pending_slot) WHERE pending_slot = 1;
CREATE INDEX ix_sessions_local_date ON sessions(local_date);
CREATE INDEX ix_sessions_status ON sessions(status);

CREATE TABLE session_entries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  section TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  planned_exercise_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  role TEXT NOT NULL,
  group_id TEXT,
  band TEXT,
  sets INTEGER NOT NULL,
  rep_target INTEGER,
  duration_sec INTEGER,
  rest_sec INTEGER NOT NULL,
  tempo_sec INTEGER NOT NULL,
  notes TEXT,
  effort TEXT NOT NULL,
  progression_family_id TEXT,
  progression_level_id_at_time TEXT,
  pattern TEXT NOT NULL,
  anchor_class TEXT NOT NULL,
  unilateral INTEGER NOT NULL DEFAULT 0,
  estimated_sec INTEGER NOT NULL,
  substituted_for TEXT,
  unplanned INTEGER NOT NULL DEFAULT 0,
  entry_status TEXT NOT NULL DEFAULT 'planned',
  difficulty_feedback TEXT,
  enjoyment_feedback INTEGER,
  demo_media_expanded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_session_entries_session ON session_entries(session_id);
CREATE INDEX ix_session_entries_exercise ON session_entries(exercise_id);

CREATE TABLE set_logs (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  set_index INTEGER NOT NULL,
  status TEXT NOT NULL,
  reps_prescribed INTEGER,
  seconds_prescribed INTEGER,
  reps_actual INTEGER,
  seconds_actual INTEGER,
  started_at TEXT,
  completed_at TEXT,
  rest_prescribed_sec INTEGER NOT NULL,
  rest_taken_sec INTEGER,
  rest_extended_count INTEGER NOT NULL DEFAULT 0,
  pause_count INTEGER NOT NULL DEFAULT 0,
  paused_duration_sec INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_set_logs_entry_index ON set_logs(entry_id, set_index);
CREATE INDEX ix_set_logs_entry ON set_logs(entry_id);

CREATE TABLE signal_events (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  utc_instant TEXT NOT NULL,
  local_date TEXT NOT NULL
);
CREATE INDEX ix_signal_events_session ON signal_events(session_id);
CREATE INDEX ix_signal_events_type ON signal_events(type);

CREATE TABLE milestones (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'local',
  type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  session_id TEXT,
  local_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE rolled_up_stats (
  user_id TEXT PRIMARY KEY DEFAULT 'local',
  lifetime_session_count INTEGER NOT NULL DEFAULT 0,
  rolling_7d_local_dates TEXT NOT NULL DEFAULT '[]',
  week_streak INTEGER NOT NULL DEFAULT 0,
  last_week_streak_check_local_date TEXT,
  travel_days_this_week INTEGER NOT NULL DEFAULT 0,
  hard_sets_by_muscle_14d TEXT NOT NULL DEFAULT '{}',
  trailing_volume_by_muscle TEXT NOT NULL DEFAULT '{}',
  estimate_accuracy_ema REAL,
  last_session_local_date TEXT,
  weeks_since_last_recovery_week INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE deferred_work (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  session_id TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  processed_at TEXT
);
CREATE INDEX ix_deferred_work_status ON deferred_work(status);
