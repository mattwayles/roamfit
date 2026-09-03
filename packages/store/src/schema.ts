/**
 * Drizzle sqlite-core schema — the local-first source of truth (§11.3). Shared verbatim between
 * the node test harness (`drizzle-orm/better-sqlite3`) and the on-device driver
 * (`drizzle-orm/op-sqlite`, wired in `app/src/db/`) — see ADR 0003.
 *
 * Table-by-spec-section map:
 *   users              §4.3
 *   limitations        §4.3 limitations[] (own table: queryable, and §13.2's pain-report source
 *                      needs createdAt/expiresAt independent of the user row's updated_at)
 *   exercise_state     §4.4 — per user × exercise, NEVER on the shared library table (invariant 7)
 *   progression_state  §4.5 — per user × family, level_id is a stable id (invariant 5)
 *   sessions           §4.6
 *   session_entries    §4.7 Entry — plan is immutable via planned_exercise_id; exercise_id is the
 *                      mutable "what actually ran" field a mid-workout swap updates
 *   set_logs           §4.7 SetLog
 *   signal_events       §8.3 catch-all append-only log for signals that aren't a natural column
 *                      on the tables above (swaps, approval edits, regenerate taps, demo-media
 *                      expansions, pinned-note edits, tz changes)
 *   milestones         §9.7 / §6.7 / §9.9 — level-ups, best-set PRs, recovery weeks, nth-session,
 *                      new-city
 *   rolled_up_stats    §11.3 — incrementally maintained, single row (single local user in v1)
 *   deferred_work      §11.3 queues — LLM distillation, HealthKit write, passport geocode.
 *                      Workers are Wave 6; this wave only enqueues.
 *   session_muscle_volume  per (session, muscle) set counts, written once at completion —
 *                      the substrate for §14.3 hard-sets-per-muscle-14d and the §5.2
 *                      OVER-WORKED trailing-volume comparison. A small append-only ledger table
 *                      queried with a `local_date >=` filter is "incrementally maintained" in
 *                      the sense §11.3 asks for (bounded recent-row scan, not full history) while
 *                      staying exact — a decaying aggregate blob would drift.
 *
 * All ids are app-generated UUIDs (text), not sqlite autoincrement — keeps id generation
 * independent of the driver and collision-free once Firestore sync (Wave 6) exists.
 */
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ------------------------------------------------------------------------------------------
// §4.3 User (single local record in v1 — id is always 'local')
// ------------------------------------------------------------------------------------------

export const users = sqliteTable('users', {
  id: text('id').primaryKey().default('local'),
  units: text('units', { enum: ['kg', 'lb'] })
    .notNull()
    .default('lb'),
  /** JSON: Record<BandId, { label, color, approx_load, note }>. */
  bandTensions: text('band_tensions').notNull().default('{}'),
  weeklyTarget: integer('weekly_target').notNull().default(3),
  /** JSON array of Anchor. §5.3 default: all band_tension on, all bodyweight_bearing off. */
  anchorsAvailable: text('anchors_available').notNull(),
  passportEnabled: integer('passport_enabled', { mode: 'boolean' }).notNull().default(false),
  healthWriteEnabled: integer('health_write_enabled', { mode: 'boolean' }).notNull().default(false),
  /** JSON: { enabled, quiet_hours, observed_training_window }. */
  notificationPrefs: text('notification_prefs').notNull().default('{}'),
  /** §12 — the tz_id last observed for this device; compared against a new session's tz_id to
   *  detect a timezone change (§9.3 travel detection, §8.3). */
  lastKnownTzId: text('last_known_tz_id'),
  hasEverCompletedSession: integer('has_ever_completed_session', { mode: 'boolean' })
    .notNull()
    .default(false),
  /** §13.3 — has this device's user ever dismissed the first-launch medical disclaimer. Migration
   *  0007. */
  hasAcknowledgedDisclaimer: integer('has_acknowledged_disclaimer', { mode: 'boolean' })
    .notNull()
    .default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const limitations = sqliteTable('limitations', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().default('local'),
  tag: text('tag').notNull(),
  note: text('note'),
  createdAt: text('created_at').notNull(),
  source: text('source', { enum: ['user', 'pain_report'] }).notNull(),
  expiresAt: text('expires_at'),
});

// ------------------------------------------------------------------------------------------
// §4.4 User Exercise State — per user × exercise, never on the shared library table.
// ------------------------------------------------------------------------------------------

export const exerciseState = sqliteTable(
  'exercise_state',
  {
    userId: text('user_id').notNull().default('local'),
    exerciseId: text('exercise_id').notNull(),
    lastPerformedAt: text('last_performed_at'),
    sessionsPerformed: integer('sessions_performed').notNull().default(0),
    bestSetReps: integer('best_set_reps'),
    bestSetSeconds: integer('best_set_seconds'),
    bestSetBand: text('best_set_band'),
    bestSetAt: text('best_set_at'),
    /** -1..+1, too_hard..too_easy. EMA over explicit difficulty feedback (§8.1). */
    difficultyEma: real('difficulty_ema').notNull().default(0),
    /** 1..5, unset/neutral defaults to 3 (§8.1). */
    enjoymentEma: real('enjoyment_ema').notNull().default(3),
    skipCount: integer('skip_count').notNull().default(0),
    swapAwayCount: integer('swap_away_count').notNull().default(0),
    removeAtApprovalCount: integer('remove_at_approval_count').notNull().default(0),
    pinnedNote: text('pinned_note'),
    suppressedUntil: text('suppressed_until'),
    /** §11.4 link-health — local half of the "two reports demote to tier 2" rule. Counts both
     *  explicit "this video is wrong or broken" taps and automatic player-error flags against one
     *  counter (see STATUS-6b-media-ladder.md's Decisions section for why they're shared).
     *  Genuinely local-only in v1: aggregating flags across users / feeding the operator's
     *  `flagged` queue is remote-config sync, track 6d's job, not built yet. This column exists so
     *  the demotion rule works fully offline before 6d exists. */
    videoFlagCount: integer('video_flag_count').notNull().default(0),
    videoDemotedAt: text('video_demoted_at'),
    /** §11.4 / ADR 0009 — a YouTube video id the user assigned themselves from the workout
     *  screen. Deliberately separate from `remote_video_config.video_id`: that table is pull-only
     *  from Firestore and a local write there would be lost on the next delta sync. Storing the
     *  id (never the pasted URL) keeps this the same shape the embed builder already consumes,
     *  and keeps a malformed URL from ever reaching the player. NULL = none assigned. */
    userVideoId: text('user_video_id'),
    userVideoAssignedAt: text('user_video_assigned_at'),
    /** User-driven, permanent exclusion from all future eligibility — set from the Exercises
     *  detail screen or the workout approval screen, cleared only by explicitly re-enabling.
     *  Distinct from `suppressedUntil`: that one is temporary and system-managed (§5.2
     *  REPEATEDLY-SKIPPED, §13.2 pain reports), this one is an explicit, indefinite user veto.
     *  NULL = eligible. */
    disabledAt: text('disabled_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [uniqueIndex('ux_exercise_state_user_exercise').on(t.userId, t.exerciseId)],
);

// ------------------------------------------------------------------------------------------
// §4.5 User Progression State — per user × family. level_id is a stable id, never an index.
// ------------------------------------------------------------------------------------------

export const progressionState = sqliteTable(
  'progression_state',
  {
    userId: text('user_id').notNull().default('local'),
    familyId: text('family_id').notNull(),
    levelId: text('level_id').notNull(),
    /** JSON: { repTarget, band, tempoSec, restSec, sets }. */
    micro: text('micro').notNull(),
    calibrating: integer('calibrating', { mode: 'boolean' }).notNull().default(true),
    consecutiveHits: integer('consecutive_hits').notNull().default(0),
    consecutiveMisses: integer('consecutive_misses').notNull().default(0),
    lastLevelChangeAt: text('last_level_change_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [uniqueIndex('ux_progression_state_user_family').on(t.userId, t.familyId)],
);

// ------------------------------------------------------------------------------------------
// §4.6 Session. Append-only; updated_at monotonic (§11.3, ready for LWW sync — not built yet).
// ------------------------------------------------------------------------------------------

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().default('local'),
    status: text('status', { enum: ['planned', 'active', 'completed', 'discarded'] }).notNull(),
    /** Set to 1 whenever status IN ('planned','active'), NULL otherwise. The partial unique
     *  index below is what makes "only one pending session" a DB-level invariant (§10.10),
     *  not just an application-level check. */
    pendingSlot: integer('pending_slot'),
    utcInstant: text('utc_instant').notNull(),
    /** §12 invariant 6 — all calendar math uses this, never utc_instant. */
    localDate: text('local_date').notNull(),
    tzId: text('tz_id').notNull(),
    focus: text('focus').notNull(),
    /** Column stays physically named `effort` (migration 0013 only rewrote its stored values,
     *  'normal' -> 'medium' — a same-shape value rename wasn't worth an `ALTER TABLE RENAME
     *  COLUMN`, unprecedented in this schema). The field here is `difficulty` to match the
     *  engine's `GenerationRequest.difficulty`/`SessionPlan.difficulty`. */
    difficulty: text('effort', { enum: ['easy', 'medium', 'hard'] }).notNull(),
    format: text('format').notNull().default('straight_sets'),
    targetMinutes: integer('target_minutes').notNull(),
    estimatedMinutes: integer('estimated_minutes').notNull(),
    actualMinutes: real('actual_minutes'),
    /** JSON array of Anchor — anchors enabled at generation time. */
    anchorsSnapshot: text('anchors_snapshot').notNull(),
    /** §5.8 explanation line as generated; never edited after the fact. */
    explanation: text('explanation').notNull(),
    /** JSON: PatternGapNote[]. */
    patternGaps: text('pattern_gaps').notNull().default('[]'),
    /** JSON: TimeBudgetDeviation | null. */
    timeBudgetDeviation: text('time_budget_deviation'),
    retrospective: text('retrospective'),
    city: text('city'),
    country: text('country'),
    generatedBy: text('generated_by', { enum: ['engine', 'engine+llm'] })
      .notNull()
      .default('engine'),
    engineVersion: text('engine_version').notNull(),
    /** §9.9 — this session got the comeback/Recovery-Week 'week' treatment (auto-detected gap
     *  OR an explicit Recovery Week trigger — same flag either way, distinguished by
     *  `recoveryWeekManual`). Drives the "Recovery week — lighter loads, same consistency" copy
     *  and the milestone row at completion. */
    comebackTier: text('comeback_tier', { enum: ['none', 'week', 'reset'] })
      .notNull()
      .default('none'),
    recoveryWeekManual: integer('recovery_week_manual', { mode: 'boolean' })
      .notNull()
      .default(false),
    /** §8.3 abandonment point — which entry/set the session was left at, if discarded mid-run. */
    abandonedEntryId: text('abandoned_entry_id'),
    abandonedSetIndex: integer('abandoned_set_index'),
    regenerateTapCount: integer('regenerate_tap_count').notNull().default(0),
    startedAt: text('started_at'),
    /** §10.4 workout-level pause (migration 0011). The instant the currently-open pause began, or
     *  NULL while the session is running. Persisted, not component state: pausing survives
     *  navigating away, force-quitting, and re-entering the screen. */
    pausedAt: text('paused_at'),
    /** Seconds banked from pauses already closed. See `activeElapsedSec`. */
    pausedTotalSec: integer('paused_total_sec').notNull().default(0),
    completedAt: text('completed_at'),
    discardedAt: text('discarded_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('ux_sessions_pending_slot')
      .on(t.pendingSlot)
      .where(sql`pending_slot = 1`),
    index('ix_sessions_local_date').on(t.localDate),
    index('ix_sessions_status').on(t.status),
  ],
);

// ------------------------------------------------------------------------------------------
// §4.7 Session Entry
// ------------------------------------------------------------------------------------------

export const sessionEntries = sqliteTable(
  'session_entries',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    section: text('section', { enum: ['warmup', 'main', 'cooldown'] }).notNull(),
    orderIndex: integer('order_index').notNull(),
    /** Immutable — what the engine planned. Never overwritten (done-criterion: planned-vs-actual
     *  is preserved, not overwritten). */
    plannedExerciseId: text('planned_exercise_id').notNull(),
    /** Mutable — what actually ran. Starts equal to plannedExerciseId; a mid-workout swap
     *  updates only this field (the swap itself is also logged to signal_events). */
    exerciseId: text('exercise_id').notNull(),
    role: text('role').notNull(),
    group: text('group_id'),
    band: text('band'),
    sets: integer('sets').notNull(),
    repTarget: integer('rep_target'),
    durationSec: integer('duration_sec'),
    restSec: integer('rest_sec').notNull(),
    tempoSec: integer('tempo_sec').notNull(),
    notes: text('notes'),
    /** See the `sessions.difficulty` doc comment above — same column-name/field-name split. */
    difficulty: text('effort', { enum: ['easy', 'medium', 'hard'] }).notNull(),
    progressionFamilyId: text('progression_family_id'),
    progressionLevelIdAtTime: text('progression_level_id_at_time'),
    pattern: text('pattern').notNull(),
    anchorClass: text('anchor_class').notNull(),
    unilateral: integer('unilateral', { mode: 'boolean' }).notNull().default(false),
    estimatedSec: integer('estimated_sec').notNull(),
    /** Engine-side substitution note (a laddered exercise that failed a hard filter and was
     *  session-only substituted, or a pattern-gap band exception) — distinct from a user-driven
     *  mid-workout swap. */
    substitutedFor: text('substituted_for'),
    /** True for an entry appended outside the generated template (Wave 4 mid-workout add). */
    unplanned: integer('unplanned', { mode: 'boolean' }).notNull().default(false),
    /** §10.10/§8.3 — preserves the plan rather than deleting a row when the user edits at
     *  approval. 'planned' is the generated default. */
    entryStatus: text('entry_status', {
      enum: ['planned', 'removed_at_approval', 'unplanned_added'],
    })
      .notNull()
      .default('planned'),
    /** §8.1 explicit feedback — per exercise, applies to every set. Unset difficulty means
     *  just_right; unset enjoyment means neutral 3 (both nullable here, resolved at read time). */
    difficultyFeedback: text('difficulty_feedback', {
      enum: ['too_easy', 'just_right', 'too_hard'],
    }),
    enjoymentFeedback: integer('enjoyment_feedback'),
    /** §8.3 — demo media expanded at least once this session for this entry. */
    demoMediaExpanded: integer('demo_media_expanded', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    index('ix_session_entries_session').on(t.sessionId),
    index('ix_session_entries_exercise').on(t.exerciseId),
  ],
);

// ------------------------------------------------------------------------------------------
// §4.7 SetLog. One committed row per set — this is the crash-safety substrate: a force-quit
// resumes by querying which set_logs rows already exist for the active session's entries.
// ------------------------------------------------------------------------------------------

export const setLogs = sqliteTable(
  'set_logs',
  {
    id: text('id').primaryKey(),
    entryId: text('entry_id').notNull(),
    setIndex: integer('set_index').notNull(),
    status: text('status', { enum: ['completed', 'skipped', 'not_reached'] }).notNull(),
    repsPrescribed: integer('reps_prescribed'),
    secondsPrescribed: integer('seconds_prescribed'),
    repsActual: integer('reps_actual'),
    secondsActual: integer('seconds_actual'),
    /** Migration 0010 — the band the user says they actually used for this set, which need not be
     *  the one `session_entries.band` prescribed. NULL means no correction was reported (every
     *  bodyweight set, and every set that simply followed the plan). */
    bandActual: text('band_actual'),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    restPrescribedSec: integer('rest_prescribed_sec').notNull(),
    restTakenSec: integer('rest_taken_sec'),
    /** §8.3 — count of "+15s" taps during this set's rest. */
    restExtendedCount: integer('rest_extended_count').notNull().default(0),
    pauseCount: integer('pause_count').notNull().default(0),
    pausedDurationSec: integer('paused_duration_sec').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('ux_set_logs_entry_index').on(t.entryId, t.setIndex),
    index('ix_set_logs_entry').on(t.entryId),
  ],
);

// ------------------------------------------------------------------------------------------
// §8.3 catch-all implicit-signal event log.
// ------------------------------------------------------------------------------------------

export const signalEvents = sqliteTable(
  'signal_events',
  {
    id: text('id').primaryKey(),
    /** Nullable — a device tz-change event isn't tied to any one session. */
    sessionId: text('session_id'),
    type: text('type', {
      enum: [
        'swap',
        'remove_at_approval',
        'add_at_approval',
        'set_added_at_approval',
        'set_deleted_at_approval',
        'rep_target_adjusted_at_approval',
        'regenerate',
        'demo_media_expanded',
        'video_flag_reported',
        'pinned_note_created',
        'pinned_note_edited',
        'abandoned',
        'tz_change',
        // §10.3/§8.3 — "the user always drags an exercise last is real information." Payload:
        // {section, orderedEntryIds}. Section-scoped, same shape as every other approval-edit
        // signal in this enum. `signal_events.type` is plain TEXT (no CHECK constraint), so
        // adding this value needs no migration.
        'reorder_at_approval',
        // §7.1/§11.3 — added in 6c-llm-proxy: the queue worker's record of what feedback
        // distillation surfaced for this session (suspected limitation, band-too-light /
        // aversion exercise ids), already validated against the session's own exercises and the
        // real limitation-tag vocabulary by `@roamfit/engine`'s validators before this is ever
        // written. Never applied automatically to anything — a suggestion only.
        'llm_distillation_result',
        // §15/Wave 7 — the one piece of §15 instrumentation with no existing raw signal to
        // derive it from: "offline share, proportion of sessions generated with no
        // connectivity" (§11 validation). Logged once per `generate()` call when the caller
        // supplies a known online/offline reading; payload: {online: boolean}. No CHECK
        // constraint backs this enum (see migration 0001 — signal_events.type is plain TEXT), so
        // adding a value here needs no migration.
        'session_generated',
        // §11.4 / ADR 0009 — the user assigned their own YouTube video to an exercise from the
        // workout screen. Payload: {exerciseId, videoId}. `signal_events.type` is plain TEXT (no
        // CHECK constraint), so adding this value needs no migration.
        'user_video_assigned',
        // ADR 0012 — the user declared a laddered exercise too easy and unlocked the next rung,
        // from approval or mid-workout. Payload: {entryId, familyId, fromLevelId, toLevelId,
        // fromExerciseId, toExerciseId}. This is the highest-signal correction the product gets
        // about a wrong starting level, and the natural feed for tuning the cold start later.
        // `signal_events.type` is plain TEXT (no CHECK constraint), so this needs no migration.
        'level_up_too_easy',
        // §10.3 — the timed counterpart to rep_target_adjusted_at_approval. Payload:
        // {entryId, exerciseId, fromDurationSec, toDurationSec}. `signal_events.type` is plain
        // TEXT (no CHECK constraint), so adding this value needs no migration.
        'duration_adjusted_at_approval',
        // §10.3 — rest length edited while reviewing the plan. Payload: {entryId, exerciseId,
        // fromRestSec, toRestSec}.
        'rest_adjusted_at_approval',
        // §10.3 — the prescribed band changed while reviewing the plan ("I'll use the red one").
        // Payload: {entryId, exerciseId, fromBand, toBand}. Distinct from the per-set
        // `set_logs.band_actual` written mid-workout: this one edits the plan before it runs.
        'band_adjusted_at_approval',
        // §10.3 — an exercise swapped BEFORE the session started. Distinct from 'swap' (§10.6,
        // mid-workout) because "rejected on sight" and "rejected after trying it" are different
        // §8.3 evidence. Payload: {entryId, fromExerciseId, toExerciseId}.
        'swap_at_approval',
        // §9.3 — one per "I'm in Transit" tap (`statsRepo.recordTravelDay`), dated to the local
        // day it was tapped for. `rolled_up_stats.travel_days_this_week` already carries the
        // count for the denominator math; this is the per-date record that count never had, so
        // the calendar heatmap (§14.1.6) can mark that specific day as a travel day rather than
        // a plain untrained square. Payload: {} — the date and the fact of the tap are the whole
        // signal. `signal_events.type` is plain TEXT (no CHECK constraint), so this needs no
        // migration.
        'travel_day',
      ],
    }).notNull(),
    /** JSON, shape depends on `type` — e.g. swap: {fromExerciseId, toExerciseId, atSetIndex}. */
    payload: text('payload').notNull().default('{}'),
    utcInstant: text('utc_instant').notNull(),
    localDate: text('local_date').notNull(),
  },
  (t) => [
    index('ix_signal_events_session').on(t.sessionId),
    index('ix_signal_events_type').on(t.type),
  ],
);

// ------------------------------------------------------------------------------------------
// §9.7 / §6.7 / §9.9 milestones.
// ------------------------------------------------------------------------------------------

export const milestones = sqliteTable('milestones', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().default('local'),
  type: text('type', {
    enum: ['level_up', 'best_set_pr', 'recovery_week', 'nth_session', 'new_city'],
  }).notNull(),
  /** JSON — e.g. level_up: {familyId, levelId}; best_set_pr: {exerciseId, reps|seconds, prior}. */
  payload: text('payload').notNull().default('{}'),
  sessionId: text('session_id'),
  localDate: text('local_date').notNull(),
  createdAt: text('created_at').notNull(),
});

// ------------------------------------------------------------------------------------------
// §11.3 rolled-up stats — single row, maintained incrementally so the dashboard never scans
// full history. Single local user in v1, so this is a singleton row (id = 'local').
// ------------------------------------------------------------------------------------------

export const rolledUpStats = sqliteTable('rolled_up_stats', {
  userId: text('user_id').primaryKey().default('local'),
  lifetimeSessionCount: integer('lifetime_session_count').notNull().default(0),
  /** §14.1.8 lifetime counters — running total of `actualMinutes` across every completed session
   *  (migration 0003). REAL, not INTEGER: `actualMinutes` itself is fractional. */
  lifetimeTotalMinutes: real('lifetime_total_minutes').notNull().default(0),
  /** §9.1 rolling 7-day window count, evaluated against weekly_target. Recomputed cheaply at
   *  read/write time from `rolling7dLocalDates` rather than re-scanning `sessions`. */
  rolling7dLocalDates: text('rolling_7d_local_dates').notNull().default('[]'),
  /** §9.1 week streak — consecutive weeks the target was hit. */
  weekStreak: integer('week_streak').notNull().default(0),
  lastWeekStreakCheckLocalDate: text('last_week_streak_check_local_date'),
  /** §9.3 travel days recorded this rolling week (reduces the denominator, floor 2). */
  travelDaysThisWeek: integer('travel_days_this_week').notNull().default(0),
  /** §14.3 — JSON: Record<muscle, number> hard-set count, trailing 14 days. */
  hardSetsByMuscle14d: text('hard_sets_by_muscle_14d').notNull().default('{}'),
  /** §5.2 OVER-WORKED comparison substrate — JSON: Record<muscle, number> trailing volume. */
  trailingVolumeByMuscle: text('trailing_volume_by_muscle').notNull().default('{}'),
  /** §14.1.9 estimate accuracy — running EMA of |actual - estimated| / estimated. */
  estimateAccuracyEma: real('estimate_accuracy_ema'),
  lastSessionLocalDate: text('last_session_local_date'),
  /** Consistent-training-run tracker for the §9.9 "every 6-8 weeks" Recovery Week auto-suggest. */
  weeksSinceLastRecoveryWeek: integer('weeks_since_last_recovery_week').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});

// ------------------------------------------------------------------------------------------
// §11.3 deferred work queues. Enqueued at completion; workers land in Wave 6.
// ------------------------------------------------------------------------------------------

export const deferredWork = sqliteTable(
  'deferred_work',
  {
    id: text('id').primaryKey(),
    kind: text('kind', {
      // §7.1 — 'llm_coach_voice' added in 6c-llm-proxy (§11.3 queue worker); the other three
      // predate it (Wave 5/6b). This is a plain TS-level enum with no SQL CHECK constraint
      // (verified against migrations/data.ts before relying on that), so adding a literal here
      // needs no migration.
      enum: ['llm_distillation', 'llm_coach_voice', 'healthkit_write', 'passport_geocode'],
    }).notNull(),
    sessionId: text('session_id').notNull(),
    payload: text('payload').notNull().default('{}'),
    status: text('status', { enum: ['pending', 'done', 'failed'] })
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    createdAt: text('created_at').notNull(),
    processedAt: text('processed_at'),
    /** §11.3 exponential backoff — see migration 0005. NULL = eligible immediately. */
    nextAttemptAt: text('next_attempt_at'),
  },
  (t) => [index('ix_deferred_work_status').on(t.status)],
);

// ------------------------------------------------------------------------------------------
// §14.3 / §5.2 per-session muscle-set ledger. Written once at completion; read with a
// local_date filter for the trailing-14-day and trailing-volume rollups.
// ------------------------------------------------------------------------------------------

export const sessionMuscleVolume = sqliteTable(
  'session_muscle_volume',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    localDate: text('local_date').notNull(),
    muscle: text('muscle').notNull(),
    /** Primary=1 credit/set, secondary=0.5 — mirrors the engine's own trailing-volume credit
     *  scheme (`selection/volume.ts`) so the dashboard's OVER-WORKED framing matches what
     *  generation itself used. */
    sets: real('sets').notNull(),
    /** Sets counted here whose entry difficulty was 'hard' — the §14.3 metric specifically. */
    hardSets: real('hard_sets').notNull().default(0),
  },
  (t) => [
    index('ix_session_muscle_volume_session').on(t.sessionId),
    index('ix_session_muscle_volume_local_date').on(t.localDate),
  ],
);

// ------------------------------------------------------------------------------------------
// §11.3 / §4.1 remote-config sync (track 6d). Local mirror of `video/{exercise_id}` — pulled
// only, never pushed by the app (video_db.py / track 6e is the only writer on the Firestore
// side). Supplies `curatedVideoId` at the media-ladder call site (issue #29/#30).
// ------------------------------------------------------------------------------------------

export const remoteVideoConfig = sqliteTable('remote_video_config', {
  exerciseId: text('exercise_id').primaryKey(),
  videoId: text('video_id'),
  videoVerifiedAt: text('video_verified_at'),
  videoFlagCount: integer('video_flag_count').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});

/** Generic key/value sync watermark table — e.g. "how far has the video-config delta pull
 *  gotten" or "how far has the append-only sessions push gotten." Deliberately not modeled on
 *  `deferred_work` (that models discrete one-shot jobs; this is continuous cursor state). */
export const syncCursor = sqliteTable('sync_cursor', {
  name: text('name').primaryKey(),
  value: text('value'),
});

// ------------------------------------------------------------------------------------------
// Migration bookkeeping.
// ------------------------------------------------------------------------------------------

export const migrationsTable = sqliteTable('_migrations', {
  id: text('id').primaryKey(),
  appliedAt: text('applied_at').notNull(),
});
