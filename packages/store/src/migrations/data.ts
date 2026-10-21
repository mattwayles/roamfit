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
-- demote an exercise's media ladder off the curated embed until a human re-curates.
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

const MIGRATION_0006_SYNC = `-- 0006_sync.sql — §11.3 Firestore sync substrate (track 6d).
--
-- remote_video_config: local mirror of the \`video/{exercise_id}\` Firestore remote-config
-- collection (§4.1's remote-config block, §11.4). Pulled, never pushed by the app — an operator
-- (video_db.py, track 6e) is the only writer on the Firestore side. This is what supplies a real
-- \`curatedVideoId\` at the WorkoutScreen media-ladder call site instead of the hard-coded \`null\`
-- 6b left behind (issue #29/#30).
--
-- sync_cursor: a small generic key/value table for "how far has each sync pass gotten" —
-- e.g. the delta-pull watermark for remote_video_config, and the push watermark for the
-- append-only \`sessions\` push. Deliberately not reusing \`deferred_work\` for this: deferred_work
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
`;

const MIGRATION_0007_DISCLAIMER = `-- 0007_disclaimer.sql — Wave 7 §13.3: "a medical disclaimer on
-- first launch and permanently in settings." The settings-screen copy needs no schema (it's just
-- always-rendered text), but first-launch gating needs one persisted bit: has this device's user
-- ever acknowledged it. Defaults false so an existing installed user (already past first launch
-- under an earlier build) sees the disclaimer exactly once on their next open, not on every open
-- thereafter.

ALTER TABLE users ADD COLUMN has_acknowledged_disclaimer INTEGER NOT NULL DEFAULT 0;
`;

const MIGRATION_0008_USER_VIDEO = `-- 0008_user_video.sql — §11.4 / ADR 0009: a user-assigned YouTube video per exercise, entered
-- from the workout screen. Lives on exercise_state (per user × exercise, invariant 7) and
-- deliberately NOT on remote_video_config: that table is pull-only from Firestore, so a local
-- write there would be silently clobbered by the next delta sync. Separate columns also keep the
-- two sources distinguishable, which is what lets the ladder prefer the user's own pick over a
-- curated id without losing the curated one underneath.
--
-- Nullable with no default: NULL means "the user has not assigned one", which is the correct
-- state for every existing row and every exercise never opened.

ALTER TABLE exercise_state ADD COLUMN user_video_id TEXT;
ALTER TABLE exercise_state ADD COLUMN user_video_assigned_at TEXT;
`;

const MIGRATION_0009_RESET_PROGRESSION_TO_LEVEL_1 = `-- 0009_reset_progression_to_level_1.sql — ADR 0012.
-- Every family used to be seeded at ~the 30th percentile of its ladder (§6.5); the cold start is
-- now level 1. Existing rows still point at the old mid-ladder placement, so this clears them.
--
-- Deleting rather than UPDATE-ing to a literal level_id is deliberate: SQL has no knowledge of
-- the ladders, and hardcoding "<family>.l1" here would duplicate ladder structure into a
-- migration where it could silently drift from families.json. \`ensureProgressionStatesInitialized\`
-- re-seeds every missing family on the next generation, taking both the level and its micro-state
-- from the engine — which keeps invariant 2 intact and means this migration cannot encode a
-- wrong starting level even if the ladders change later.
--
-- exercise_state is deliberately untouched: enjoyment EMAs, skip/swap counts, best sets and
-- user-assigned videos are all still true, and none of them describe a ladder position.

DELETE FROM progression_state;
`;

const MIGRATION_0010_SET_LOG_BAND_ACTUAL = `-- 0010_set_log_band_actual.sql — which band the user actually picked up for one set.
--
-- session_entries.band is the *prescription* (what the engine planned, editable at approval), and
-- it stays that way — planned-vs-actual is preserved, never overwritten, exactly as it is for
-- exercise_id/planned_exercise_id. The band actually trained with is a per-set fact: a user who
-- starts a set on B2 and finishes the next two on B3 has told us something real, and averaging
-- that into one per-entry column would lose it.
--
-- NULL means "no correction reported" — every existing row, every bodyweight set, and every set
-- where the prescription was simply followed. Completion reads this back to decide what band the
-- next session should be built around (see \`reconcileMicroToObservedBand\` in the engine).

ALTER TABLE set_logs ADD COLUMN band_actual TEXT;
`;

const MIGRATION_0011_SESSION_PAUSE = `-- 0011_session_pause.sql — the workout-level pause, made real.
--
-- Pausing used to be a component-local \`useState\` on the workout screen, which meant two things:
-- the elapsed timer kept counting while "paused" (it was derived from \`started_at\` alone, with
-- nothing to subtract), and the pause was lost the moment the screen unmounted — which is exactly
-- what pausing did, since it navigated away.
--
-- \`paused_at\` is the instant the currently-open pause began (NULL = running), and
-- \`paused_total_sec\` banks every pause already closed. Elapsed is then
-- \`now - started_at - paused_total_sec - (now - paused_at)\`, which is suspension-proof for the
-- same reason the countdown controllers are: it re-derives from absolute instants rather than
-- counting ticks. Defaults mean every existing session reads as "never paused", which is true.

ALTER TABLE sessions ADD COLUMN paused_at TEXT;
ALTER TABLE sessions ADD COLUMN paused_total_sec INTEGER NOT NULL DEFAULT 0;
`;

const MIGRATION_0012_EXERCISE_DISABLED = `-- 0012_exercise_disabled.sql — explicit, permanent user veto on an exercise, distinct from
-- \`suppressed_until\` (temporary, system-managed §5.2/§13.2 cooldown). Set from the Exercises
-- detail screen or the workout approval screen; cleared only by explicitly re-enabling.
-- Lives on exercise_state (per user x exercise, invariant 7) — same shape as every other
-- per-exercise user toggle already there. NULL = eligible, which is correct for every
-- existing row.

ALTER TABLE exercise_state ADD COLUMN disabled_at TEXT;
`;

const MIGRATION_0013_EFFORT_TO_DIFFICULTY = `-- 0013_effort_to_difficulty.sql — the session-level "Effort" dial is retired; the app now asks
-- for a "Difficulty" that reuses the exercise library's own difficulty scale, so its middle value
-- renames from 'normal' to 'medium' to match. Both columns stay physically named \`effort\` —
-- schema.ts maps them to a \`difficulty\` field; a same-shape value rename isn't worth an
-- ALTER TABLE RENAME COLUMN, unprecedented in this schema.

UPDATE sessions SET effort = 'medium' WHERE effort = 'normal';
UPDATE session_entries SET effort = 'medium' WHERE effort = 'normal';
`;

const MIGRATION_0014_CUE_SOUNDS = `-- 0014_cue_sounds.sql — the 3-2-1 / completion / rest-zero cue tones (§10.8) become a user
-- setting. Default 1 (on), which is the behaviour every existing install already has, so no row
-- changes meaning. Haptics are not covered by this and stay unconditional: muting is about not
-- making noise, not about training without cues.

ALTER TABLE users ADD COLUMN cue_sounds_enabled INTEGER NOT NULL DEFAULT 1;
`;

const MIGRATION_0015_MANUAL_DAY_MARKERS = `-- 0015_manual_day_markers.sql — §14.1.6 calendar heatmap: lets the user re-tag one day's marker
-- by hand (no workout / travel day / a focus letter), for a workout that happened outside
-- Wanderlift or a travel day that went unlogged. Per user x local_date (invariant 7's per-user-state
-- shape, keyed by date instead of exercise/family), one row per day, last-write-wins on a re-edit
-- rather than an appended history. Never touches \`sessions\` or \`signal_events\` — the marker is
-- display-only.

CREATE TABLE manual_day_markers (
  user_id TEXT NOT NULL DEFAULT 'local',
  local_date TEXT NOT NULL,
  marker TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_manual_day_markers_user_date ON manual_day_markers(user_id, local_date);
`;

const MIGRATION_0016_SESSION_CURSOR = `-- 0016_session_cursor.sql — a persisted "you are here" override.
--
-- "You are here" used to be purely derived: the first not-yet-logged set, re-walked from
-- set_logs on every read (see findCurrentEntry). That is still what decides whether the workout
-- is *done*. But tapping a set from Summary is a user selection, not a crash-safety resume, and
-- it needs to survive leaving the screen: \`cursor_entry_id\`/\`cursor_set_index\` is where that
-- selection is now written. NULL means no override — everything falls back to the derived front
-- edge, exactly as before this column existed.

ALTER TABLE sessions ADD COLUMN cursor_entry_id TEXT;
ALTER TABLE sessions ADD COLUMN cursor_set_index INTEGER;
`;

const MIGRATION_0017_SET_LEVEL_FEEDBACK = `-- 0017_set_level_feedback.sql — main-exercise feedback moves from the entry to the set.
--
-- difficulty_feedback/enjoyment_feedback on session_entries assumed one answer covered every set
-- of an exercise, which is only true for warm-up/cool-down (judged as a block, one question per
-- stage). A \`main\` exercise can genuinely feel different set to set — a band bumped up between
-- sets, fatigue setting in by set 3 — so its feedback now lives per set_logs row instead. The
-- session_entries columns stay (warm-up/cool-down still share one answer, written there via
-- recordSectionFeedback); a main entry just no longer uses them.

ALTER TABLE set_logs ADD COLUMN difficulty_feedback TEXT;
ALTER TABLE set_logs ADD COLUMN enjoyment_feedback INTEGER;
`;

const MIGRATION_0018_REMOVE_ENJOYMENT = `-- 0018_remove_enjoyment.sql — the enjoyment dimension of feedback is gone, not just unused.
--
-- Set feedback is difficulty only now (too_easy / just_right / too_hard) — enjoyment (the 1-5
-- rating) never earned its keep as a second axis and its removal reaches further than the UI: it
-- also drove exercise-selection behavior (avoiding disliked exercises, capping how often
-- "favorites" got picked, breaking swap-alternative ties), all removed from the engine in the
-- same change. Nothing reads or writes these three columns any more, so they are dropped rather
-- than left as permanent dead weight.

ALTER TABLE exercise_state DROP COLUMN enjoyment_ema;
ALTER TABLE session_entries DROP COLUMN enjoyment_feedback;
ALTER TABLE set_logs DROP COLUMN enjoyment_feedback;
`;

const MIGRATION_0019_SESSION_IS_QUICK = `-- 0019_session_is_quick.sql — §9.5/§14.1.6: Quick Session becomes a persisted fact on the
-- session row, not just a generation-time request flag. The calendar heatmap needs to tell a
-- Quick Session apart from a regular same-focus session, which \`focus\` alone can't do (Quick
-- Session always requests 'full'). Defaults false, which is correct for every existing row —
-- Quick Session didn't exist as a distinct persisted concept before this.

ALTER TABLE sessions ADD COLUMN is_quick INTEGER NOT NULL DEFAULT 0;
`;

const MIGRATION_0020_REMOVE_CALIBRATION = `-- 0020_remove_calibration.sql — calibration mode is gone. A new user now starts at level 1 and
-- moves only by meeting/missing the ordinary prescription or an explicit "too easy — level up" /
-- "too hard — level down" tap on the progression board. \`calibrating\` no longer means anything to
-- either the engine or the app, so the column is dropped rather than left as dead weight (same
-- call as 0018_remove_enjoyment.sql).

ALTER TABLE progression_state DROP COLUMN calibrating;
`;

const MIGRATION_0021_SESSION_RESTING = `-- 0021_session_resting.sql — the rest page currently on screen, made real.
--
-- Which set the user just finished and is now resting after used to be a component-local
-- \`useState\` on the workout screen (\`phase\`/\`restingEntryId\`/\`restingSetIndex\`), which meant it
-- was lost the moment the screen unmounted — including the "Progress" button, which \`replace\`s
-- Workout with Summary. Coming back from Summary always re-derived the front edge (the *next*
-- not-yet-logged set) and landed on its exercise page, silently skipping the rest the user was
-- still on.
--
-- \`resting_entry_id\`/\`resting_set_index\` are that same pair, persisted; \`resting_started_at\` is
-- the instant the rest began, so the countdown can resume with the correct remaining time instead
-- of restarting at the full prescribed rest. NULL means not currently resting — display and
-- resume both fall back to the derived front edge, exactly as before these columns existed.

ALTER TABLE sessions ADD COLUMN resting_entry_id TEXT;
ALTER TABLE sessions ADD COLUMN resting_set_index INTEGER;
ALTER TABLE sessions ADD COLUMN resting_started_at TEXT;
`;

const MIGRATION_0022_THEME_PREFERENCE = `-- 0022_theme_preference.sql — Daylight light mode (docs/DESIGN.md §8): which look the app wears.
-- 'system' follows iOS appearance, 'light' is Daylight, 'dark' is Golden Hour. Default 'system'.
-- Presentation only; nothing in the engine or the sync payload reads it.

ALTER TABLE users ADD COLUMN theme_preference TEXT NOT NULL DEFAULT 'system';
`;

const MIGRATION_0023_SPOTIFY_PLAYLISTS = `-- 0023_spotify_playlists.sql — Spotify sheet: remembers which "vibes" (genres/eras) the user wants
-- workout playlists tuned to, and keeps the playlists they have played or hearted so those are
-- one tap away offline instead of re-found through search every time.
--
-- \`spotify_vibes\` is a JSON array of stable vibe ids (never labels, so a rename can't orphan a
-- stored choice); \`'[]'\` means "no preference" and the app treats it as the generic search.
--
-- \`spotify_playlists\` is per user x playlist (invariant 7's per-user-state shape). One row serves
-- both lists: a row with \`favorited_at\` is a favorite, a row with \`last_played_at\` and no
-- favorite is a recent. A favorite can exist without ever being played (hearted from a search
-- result), hence both timestamps are nullable. Only recents are pruned (to the 25 most recently
-- played); favorites are the user's deliberate keepers and are never dropped. \`name\`/\`uri\`/\`owner\`
-- are refreshed on every play so a renamed playlist doesn't go stale. Local-only, not synced.

ALTER TABLE users ADD COLUMN spotify_vibes TEXT NOT NULL DEFAULT '[]';

CREATE TABLE spotify_playlists (
  user_id TEXT NOT NULL DEFAULT 'local',
  playlist_id TEXT NOT NULL,
  uri TEXT NOT NULL,
  name TEXT NOT NULL,
  owner TEXT,
  last_played_at TEXT,
  play_count INTEGER NOT NULL DEFAULT 0,
  favorited_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_spotify_playlists_user_playlist ON spotify_playlists(user_id, playlist_id);
`;

const MIGRATION_0024_SESSION_PLACE = `-- 0024_session_place.sql — Passport stamps read "Bend, OR, USA" instead of just "Bend": keep the
-- region (state/province, abbreviated when the geocoder abbreviates it) and the ISO country code
-- next to the existing city/country strings. Nullable — sessions pinned before this have neither,
-- and their stamps simply render without them. Strings only, never coordinates.

ALTER TABLE sessions ADD COLUMN region TEXT;
ALTER TABLE sessions ADD COLUMN country_code TEXT;
`;

const MIGRATION_0025_FEEDBACK_PROMPT = `-- 0025_feedback_prompt.sql — "How did that set feel?" can open as a modal over the rest screen
-- instead of sitting inline on it. Default 1 (modal) because the answer is the most useful signal
-- progression gets; turning it off restores the inline control, which is the behaviour every
-- earlier install had.

ALTER TABLE users ADD COLUMN feedback_prompt_enabled INTEGER NOT NULL DEFAULT 1;
`;

const MIGRATION_0026_ENTRY_FEEDBACK = `-- 0026_entry_feedback.sql — difficulty feedback is asked once per EXERCISE (after its last set)
-- again, so it lives on session_entries.difficulty_feedback, not per set (undoing the shape of
-- 0017). set_logs.difficulty_feedback stays physically but is legacy: nothing writes or reads it
-- after this. Sessions recorded under 0017 carry their answers only there, so fold each entry's
-- per-set answers into its own column with the same worst-case read progression always used
-- (too_hard beats too_easy beats just_right), leaving entries that already have an answer alone.

UPDATE session_entries
SET difficulty_feedback = (
  SELECT CASE
    WHEN SUM(difficulty_feedback = 'too_hard') > 0 THEN 'too_hard'
    WHEN SUM(difficulty_feedback = 'too_easy') > 0 THEN 'too_easy'
    ELSE 'just_right'
  END
  FROM set_logs
  WHERE set_logs.entry_id = session_entries.id AND set_logs.difficulty_feedback IS NOT NULL
)
WHERE difficulty_feedback IS NULL
  AND EXISTS (
    SELECT 1 FROM set_logs
    WHERE set_logs.entry_id = session_entries.id AND set_logs.difficulty_feedback IS NOT NULL
  );
`;

const MIGRATION_0027_WORKING_BAND = `-- 0027_working_band.sql — the band the user last finished an exercise's main working sets on.
-- An exercise with no progression family is prescribed off the library alone, so before this it
-- reset to its lightest authored band every session however the user had changed it. Backfilled
-- from history so a band already moved up in a past session counts straight away: the final
-- completed set of the most recent completed session's main entry for that exercise, using the
-- band the user reported on it, else the band that was prescribed.

ALTER TABLE exercise_state ADD COLUMN working_band TEXT;

UPDATE exercise_state
SET working_band = (
  SELECT COALESCE(set_logs.band_actual, session_entries.band)
  FROM set_logs
  JOIN session_entries ON session_entries.id = set_logs.entry_id
  JOIN sessions ON sessions.id = session_entries.session_id
  WHERE session_entries.exercise_id = exercise_state.exercise_id
    AND session_entries.section = 'main'
    AND sessions.status = 'completed'
    AND set_logs.status = 'completed'
    AND COALESCE(set_logs.band_actual, session_entries.band) IS NOT NULL
  ORDER BY sessions.completed_at DESC, set_logs.set_index DESC
  LIMIT 1
);
`;

const MIGRATION_0028_ACCESSORY_MICRO = `-- 0028_accessory_micro.sql — an accessory (a main exercise with no progression family) now climbs
-- the same micro-progression ladder a family does, tracked per exercise. Its band is the existing
-- working_band (0027); these hold the rest of the ladder position. NULL micro_rep_target = not on
-- the ladder yet: the exercise is prescribed off the day's difficulty table until it first
-- completes as an accessory. Exercises already trained as accessories are seeded from history in
-- TypeScript (seedAccessoryProgressionFromHistory), since the seed applies engine rules.

ALTER TABLE exercise_state ADD COLUMN micro_rep_target INTEGER;
ALTER TABLE exercise_state ADD COLUMN micro_tempo_sec INTEGER;
ALTER TABLE exercise_state ADD COLUMN micro_rest_sec INTEGER;
ALTER TABLE exercise_state ADD COLUMN micro_sets INTEGER;
ALTER TABLE exercise_state ADD COLUMN micro_consecutive_misses INTEGER NOT NULL DEFAULT 0;
`;

const MIGRATION_0029_LIMITATION_CHOICES = `-- 0029_limitation_choices.sql — Track 37a: the plain-language limitation choices a user picked in
-- onboarding or Settings (LIMITATION_CHOICES in packages/data), as a JSON array of
-- {"id": "<choice id>", "since": "<local_date>"}. Choice ids, not tags, are stored so that a later
-- review of a choice's tag mapping reaches every user who already picked it; buildUserProfile
-- expands them into engine limitations. The limitations table stays for dated, tag-level rows.

ALTER TABLE users ADD COLUMN limitation_choices TEXT NOT NULL DEFAULT '[]';
`;

const MIGRATION_0030_TRAINING_PREFS = `-- 0030_training_prefs.sql — Track 37f: the user's training preferences (goal, rest, variety,
-- recovery, progression pace, warm-up length) as one JSON object. '{}' means every default, and the
-- defaults reproduce the engine's behaviour from before preferences existed, so existing installs
-- see no change until they choose one. micro_consecutive_hits banks qualifying sessions on an
-- accessory's own ladder under the "patient" pace (always 0 at the default pace).

ALTER TABLE users ADD COLUMN training_prefs TEXT NOT NULL DEFAULT '{}';
ALTER TABLE exercise_state ADD COLUMN micro_consecutive_hits INTEGER NOT NULL DEFAULT 0;
`;

const MIGRATION_0031_ENTRY_TRANSITION = `-- 0031_entry_transition.sql — Track 37f: the changeover allowance (seconds between exercises) an
-- entry's estimated_sec was computed with, when it is the user's learned value rather than the
-- default 60s. NULL = the default. Kept on the entry so an approval edit re-estimates it with the
-- same allowance the generator used.

ALTER TABLE session_entries ADD COLUMN transition_sec INTEGER;
`;

const MIGRATION_0032_ONBOARDING = `-- 0032_onboarding.sql — Track 37h: where the first-launch setup stands. NULL = not in it (an install
-- from before onboarding existed, or any user who has not started it); 'in_progress' = the medical
-- disclaimer was acknowledged and setup is under way, so a relaunch resumes it; 'done' = finished
-- or skipped. Existing installs stay NULL and never see it unless they open it from Settings.

ALTER TABLE users ADD COLUMN onboarding_state TEXT;
`;

const MIGRATION_0033_BAND_SETTINGS = `-- 0033_band_settings.sql — Track 37i: which single bands the user owns and whether they stack two
-- for more tension than their heaviest, as JSON {"owned": ["B1",...], "stacking": false}. '{}'
-- means every band owned and no stacking, which is exactly how the app behaved before.

ALTER TABLE users ADD COLUMN band_settings TEXT NOT NULL DEFAULT '{}';
`;

const MIGRATION_0034_BADGES = `-- 0034_badges.sql — Track 38: permanent badge awards. One row per badge_id, so a badge can never
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
`;

const MIGRATION_0035_BANDS_SET_UP = `-- 0035_bands_set_up.sql — Track 40: Your bands left first-launch setup. Generate now offers it the
-- first time Resistance bands is ticked, so it needs to know whether the user has ever chosen their
-- bands. Every existing row went through a setup that asked (or predates it), so it counts as set
-- up; a new row starts at 0.

ALTER TABLE users ADD COLUMN bands_set_up INTEGER NOT NULL DEFAULT 0;
UPDATE users SET bands_set_up = 1;
`;

const MIGRATION_0036_REMOVE_WEEKLY_TARGET = `-- 0036_remove_weekly_target.sql — Track 40: training days per week is gone from the app. It only
-- ever fed the week streak (and its "N weeks on target" motivation lines), which also broke the
-- no-streaks rule, so the target, the streak and the streak's never-used check date are dropped
-- rather than left as dead weight (same call as 0018_remove_enjoyment.sql).

ALTER TABLE users DROP COLUMN weekly_target;
ALTER TABLE rolled_up_stats DROP COLUMN week_streak;
ALTER TABLE rolled_up_stats DROP COLUMN last_week_streak_check_local_date;
`;

const MIGRATION_0037_REMOVE_SPOTIFY = `-- 0037_remove_spotify.sql — Spotify is gone from the app (controls could not work offline), so its
-- table and the per-user vibe selection are dropped rather than left as dead weight (same call as
-- 0018_remove_enjoyment.sql).

DROP TABLE spotify_playlists;
ALTER TABLE users DROP COLUMN spotify_vibes;
`;

const MIGRATION_0038_REMOVE_FIREBASE = `-- 0038_remove_firebase.sql — Firebase is gone from the app (no Firestore sync, no LLM proxy), so
-- the tables that only served it are dropped rather than left as dead weight (same call as
-- 0018_remove_enjoyment.sql): \`remote_video_config\` (the pull-only mirror of Firestore's curated
-- video ids) and \`sync_cursor\` (the sync watermarks). Queued LLM jobs can never run now, so any
-- still pending are deleted.

DROP TABLE remote_video_config;
DROP TABLE sync_cursor;
DELETE FROM deferred_work WHERE kind IN ('llm_distillation', 'llm_coach_voice');
`;

const MIGRATION_0039_ICLOUD_BACKUP = `-- 0039_icloud_backup.sql — Track 43: iCloud backup. \`icloud_backup_enabled\` is the Settings switch
-- (ON by default, so every existing row opts in too). \`backup_decision_pending\` is set at first
-- launch when a backup already exists in iCloud and cleared by Restore or "Start fresh"; while it
-- is set the app never uploads, so an empty fresh install cannot overwrite a real backup.

ALTER TABLE users ADD COLUMN icloud_backup_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN backup_decision_pending INTEGER NOT NULL DEFAULT 0;
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
  { id: '0006_sync.sql', sql: MIGRATION_0006_SYNC },
  { id: '0007_disclaimer.sql', sql: MIGRATION_0007_DISCLAIMER },
  { id: '0008_user_video.sql', sql: MIGRATION_0008_USER_VIDEO },
  {
    id: '0009_reset_progression_to_level_1.sql',
    sql: MIGRATION_0009_RESET_PROGRESSION_TO_LEVEL_1,
  },
  { id: '0010_set_log_band_actual.sql', sql: MIGRATION_0010_SET_LOG_BAND_ACTUAL },
  { id: '0011_session_pause.sql', sql: MIGRATION_0011_SESSION_PAUSE },
  { id: '0012_exercise_disabled.sql', sql: MIGRATION_0012_EXERCISE_DISABLED },
  { id: '0013_effort_to_difficulty.sql', sql: MIGRATION_0013_EFFORT_TO_DIFFICULTY },
  { id: '0014_cue_sounds.sql', sql: MIGRATION_0014_CUE_SOUNDS },
  { id: '0015_manual_day_markers.sql', sql: MIGRATION_0015_MANUAL_DAY_MARKERS },
  { id: '0016_session_cursor.sql', sql: MIGRATION_0016_SESSION_CURSOR },
  { id: '0017_set_level_feedback.sql', sql: MIGRATION_0017_SET_LEVEL_FEEDBACK },
  { id: '0018_remove_enjoyment.sql', sql: MIGRATION_0018_REMOVE_ENJOYMENT },
  { id: '0019_session_is_quick.sql', sql: MIGRATION_0019_SESSION_IS_QUICK },
  { id: '0020_remove_calibration.sql', sql: MIGRATION_0020_REMOVE_CALIBRATION },
  { id: '0021_session_resting.sql', sql: MIGRATION_0021_SESSION_RESTING },
  { id: '0022_theme_preference.sql', sql: MIGRATION_0022_THEME_PREFERENCE },
  { id: '0023_spotify_playlists.sql', sql: MIGRATION_0023_SPOTIFY_PLAYLISTS },
  { id: '0024_session_place.sql', sql: MIGRATION_0024_SESSION_PLACE },
  { id: '0025_feedback_prompt.sql', sql: MIGRATION_0025_FEEDBACK_PROMPT },
  { id: '0026_entry_feedback.sql', sql: MIGRATION_0026_ENTRY_FEEDBACK },
  { id: '0027_working_band.sql', sql: MIGRATION_0027_WORKING_BAND },
  { id: '0028_accessory_micro.sql', sql: MIGRATION_0028_ACCESSORY_MICRO },
  { id: '0029_limitation_choices.sql', sql: MIGRATION_0029_LIMITATION_CHOICES },
  { id: '0030_training_prefs.sql', sql: MIGRATION_0030_TRAINING_PREFS },
  { id: '0031_entry_transition.sql', sql: MIGRATION_0031_ENTRY_TRANSITION },
  { id: '0032_onboarding.sql', sql: MIGRATION_0032_ONBOARDING },
  { id: '0033_band_settings.sql', sql: MIGRATION_0033_BAND_SETTINGS },
  { id: '0034_badges.sql', sql: MIGRATION_0034_BADGES },
  { id: '0035_bands_set_up.sql', sql: MIGRATION_0035_BANDS_SET_UP },
  { id: '0036_remove_weekly_target.sql', sql: MIGRATION_0036_REMOVE_WEEKLY_TARGET },
  { id: '0037_remove_spotify.sql', sql: MIGRATION_0037_REMOVE_SPOTIFY },
  { id: '0038_remove_firebase.sql', sql: MIGRATION_0038_REMOVE_FIREBASE },
  { id: '0039_icloud_backup.sql', sql: MIGRATION_0039_ICLOUD_BACKUP },
];
