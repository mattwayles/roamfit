/**
 * Migration SQL, embedded as TS string constants rather than read from disk at runtime.
 *
 * See ADR 0005 for why: `migrate.ts` originally read these via `fs.readdirSync`/`readFileSync`
 * against `.sql` files in this directory — fine in node (tests, and this package's own `tsc`
 * typecheck), but Metro (the bundler the real RN app runs through) has no `node:fs`/`node:path`
 * and no on-device filesystem access to a "source directory" at runtime; a real `expo run:ios`
 * build fails at the first screen that calls `getDb()` with "Unable to resolve module node:fs."
 * Embedding the content as plain TS data works identically under Jest/node and under Metro/RN —
 * no bundler config, no polyfill, no asset-loader plumbing.
 *
 * The `.sql` files in this directory (`0001_init.sql`, `0002_muscle_volume.sql`) are kept
 * alongside this file purely as the reviewable, syntax-highlighted source of truth — **this
 * file's content must be kept byte-for-byte in sync with them by hand** (there is no codegen
 * step, consistent with ADR 0003's "hand-authored, reviewable migrations" stance). A test
 * (`migrate.test.ts`) enforces this so the two can't silently drift.
 */
export interface MigrationFile {
  id: string;
  sql: string;
}

const MIGRATION_0001_INIT = `-- 0001_init.sql — initial schema. See ../schema.ts for the authoritative field-by-field
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
`;

const MIGRATION_0002_MUSCLE_VOLUME = `-- 0002_muscle_volume.sql — §14.3/§5.2 per-session muscle-set ledger, added after 0001 to prove
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
`;

const MIGRATION_0003_LIFETIME_TOTAL_MINUTES = `-- 0003_lifetime_total_minutes.sql — §14.1.8 lifetime counters need a running lifetime total of
-- actual session minutes. Everything else that column needs (session count, cities, countries,
-- levels gained, best sets) is already derivable from existing rolled-up/milestone data without a
-- new column; total minutes was the one true gap, so this is the smallest schema change that
-- closes it, added incrementally in \`recordSessionCompletion\` rather than summed from full
-- history on every dashboard read (§11.3).

ALTER TABLE rolled_up_stats ADD COLUMN lifetime_total_minutes REAL NOT NULL DEFAULT 0;
`;

const MIGRATION_0004_VIDEO_FLAGS = `-- 0004_video_flags.sql — §11.4 link-health local state: two video-quality flags (user reports
-- and/or automatic player-error flags, sharing one counter — see STATUS-6b-media-ladder.md)
-- demote an exercise's media ladder to tier 2 (the bundled figure) until a human re-curates.
-- Lives on exercise_state (per user x exercise, invariant 7) rather than a new table because it
-- is exactly that shape and exercise_state already has the ensure-row-on-first-write pattern this
-- needs.

ALTER TABLE exercise_state ADD COLUMN video_flag_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exercise_state ADD COLUMN video_demoted_at TEXT;
`;

const MIGRATION_0005_LLM_QUEUE_BACKOFF = `-- 0005_llm_queue_backoff.sql — §11.3 LLM queue: exponential backoff needs a per-row "not
-- eligible before" timestamp. \`created_at\` alone isn't enough once a job has already failed once
-- (its retry delay is relative to the last attempt, not to when it was first enqueued).
-- NULL means "eligible immediately" (the common case: a freshly-enqueued, never-attempted job).

ALTER TABLE deferred_work ADD COLUMN next_attempt_at TEXT;
`;

/** Ordered oldest-first — `migrate.ts` applies whichever suffix of this list isn't yet recorded
 *  in `_migrations`. Append new migrations here (and as a new `.sql` file for review) in order;
 *  never edit or reorder an existing entry once shipped. */
export const MIGRATIONS: MigrationFile[] = [
  { id: '0001_init.sql', sql: MIGRATION_0001_INIT },
  { id: '0002_muscle_volume.sql', sql: MIGRATION_0002_MUSCLE_VOLUME },
  { id: '0003_lifetime_total_minutes.sql', sql: MIGRATION_0003_LIFETIME_TOTAL_MINUTES },
  { id: '0004_video_flags.sql', sql: MIGRATION_0004_VIDEO_FLAGS },
  { id: '0005_llm_queue_backoff.sql', sql: MIGRATION_0005_LLM_QUEUE_BACKOFF },
];
