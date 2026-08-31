/**
 * Core engine types — the shape of what flows through the §5.1 pipeline.
 *
 * These are engine-internal input/output contracts, not the persistence schema. Wave 3 owns
 * SQLite tables and maps to/from these shapes; the engine never reads or writes storage itself.
 * Where a type mirrors a spec.md domain object, the section is noted.
 */
import type {
  Anchor,
  AnchorClass,
  Contraindication,
  Exercise,
  Focus,
  Pattern,
  ProgressionFamilyId,
  Role,
} from '@roamfit/data';

/** §5.4 — the user's chosen effort for today, not absolute difficulty. */
export type Effort = 'easy' | 'normal' | 'hard';

/** §8.1 difficulty feedback, 3-position control. Unset means `just_right`. */
export type DifficultyFeedback = 'too_easy' | 'just_right' | 'too_hard';

/** Band identifiers, lightest to heaviest (§5.7). */
export type BandId = 'B1' | 'B2' | 'B3' | 'B4' | 'B5';
export const BAND_ORDER: readonly BandId[] = ['B1', 'B2', 'B3', 'B4', 'B5'];

/** `local_date` string, `YYYY-MM-DD`. Invariant 6: all calendar math uses this, never UTC. */
export type LocalDate = string;

// --------------------------------------------------------------------------------------------
// Injected seams — no ambient clock, no ambient randomness (hard architectural constraints).
// --------------------------------------------------------------------------------------------

/** The caller's notion of "now," passed in rather than read from `Date.now()`. */
export interface EngineClock {
  today: LocalDate;
  tzId: string;
}

/** A seeded, deterministic random source. Same seed → same sequence, always. */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
}

// --------------------------------------------------------------------------------------------
// Per-user state the engine reads (§4.3–§4.5). Callers own persistence; this is just the shape.
// --------------------------------------------------------------------------------------------

export interface Limitation {
  tag: Contraindication;
  note?: string;
  createdAt: LocalDate;
  source: 'user' | 'pain_report';
  expiresAt?: LocalDate;
}

/** §4.3 — subset relevant to generation. */
export interface UserProfile {
  units: 'kg' | 'lb';
  weeklyTarget: number;
  limitations: Limitation[];
  /** §5.3 — single global sticky list, the one per-session constraint. */
  anchorsAvailable: Anchor[];
}

/** §4.4 — per user × exercise. Never on the shared library table (invariant 7). */
export interface ExerciseState {
  exerciseId: string;
  lastPerformedAt: LocalDate | null;
  sessionsPerformed: number;
  bestSet: { reps?: number; seconds?: number; band?: BandId; at: LocalDate } | null;
  /** -1..+1, too_hard .. too_easy. */
  difficultyEma: number;
  /** 1..5. Unset/neutral defaults to 3. */
  enjoymentEma: number;
  skipCount: number;
  swapAwayCount: number;
  removeAtApprovalCount: number;
  pinnedNote: string | null;
  /** Set by REPEATEDLY-SKIPPED (§5.2) or a pain report (§13.2). */
  suppressedUntil: LocalDate | null;
}

/** §4.5 — per user × progression family. `level_id` is stable, never a positional index. */
export interface ProgressionMicroState {
  repTarget: number;
  band: BandId | null;
  tempoSec: number;
  restSec: number;
  sets: number;
}

export interface ProgressionState {
  familyId: ProgressionFamilyId;
  levelId: string;
  micro: ProgressionMicroState;
  calibrating: boolean;
  consecutiveHits: number;
  consecutiveMisses: number;
  lastLevelChangeAt: LocalDate | null;
}

/**
 * A minimal record of a past session, enough to drive §5.2 variety/recovery/volume rules
 * without re-deriving them from full SQLite session/entry rows. Wave 3 projects §4.6/§4.7
 * session history into this shape when calling the engine. Ordered oldest → newest by caller;
 * the engine does not re-sort.
 */
export interface SessionHistoryEntry {
  exerciseId: string;
  role: Role;
  /** Effort actually prescribed to this exercise (may be capped below the session's effort). */
  effort: Effort;
  /** Sets actually prescribed (planned, not necessarily all completed) — drives trailing muscle
   *  volume the same way the prototype's `muscle_sets` does (primary=1 credit/set, secondary=0.5).
   *  Defaults to 1 if a caller can't supply it (e.g. warmup/cooldown, or legacy data). */
  sets?: number;
}

export interface SessionHistoryRecord {
  localDate: LocalDate;
  focus: Focus;
  effort: Effort;
  status: 'completed' | 'partial' | 'skipped' | 'discarded';
  entries: SessionHistoryEntry[];
}

/** Everything the engine reads about the user, bundled for one generation call. */
export interface UserState {
  profile: UserProfile;
  exerciseStates: Record<string, ExerciseState>;
  progressionStates: Record<ProgressionFamilyId, ProgressionState>;
  /** Most recent last. Callers may cap this (e.g. last 90 days) — the engine only looks back
   *  as far as the rules require (5 sessions for PREFERRED, 14 days for trailing volume, etc). */
  history: SessionHistoryRecord[];
  /** True once the user has completed at least one session ever (any focus). Drives the
   *  once-only calibration notice (§6.5) and comeback-vs-first-run distinction. */
  hasEverCompletedSession: boolean;
}

// --------------------------------------------------------------------------------------------
// Request / response
// --------------------------------------------------------------------------------------------

export type EquipmentPreference = 'any' | 'band' | 'bodyweight';

export interface GenerationRequest {
  focus: Focus;
  effort: Effort;
  /** Target session length in minutes, warmup and cooldown included. */
  targetMinutes: number;
  equipmentPreference?: EquipmentPreference;
  /** §9.5 — same pipeline, minimal template (1 warmup + 3 main + 1 cooldown), ~7min, `normal`. */
  quickSession?: boolean;
}

export type SessionFormat = 'straight_sets';

export interface PrescribedSet {
  index: number;
  targetReps?: number;
  targetSeconds?: number;
}

export interface SessionEntry {
  exerciseId: string;
  role: Role;
  /** A1/A2 for superset pairs; undefined for straight sets. */
  group?: string;
  band: BandId | null;
  sets: number;
  repTarget?: number;
  durationSec?: number;
  restSec: number;
  tempoSec: number;
  notes?: string;
  /** True when the effort actually prescribed was capped below the session's chosen effort
   *  (§13.1 bodyweight-bearing cap, or 48h recovery). */
  effort: Effort;
  progressionFamilyId: ProgressionFamilyId | null;
  progressionLevelIdAtTime: string | null;
  pattern: Pattern;
  anchorClass: AnchorClass;
  unilateral: boolean;
  estimatedSec: number;
  /** §4.7 — set when the engine swapped in a different exercise than the "default" pick for this
   *  slot: a laddered exercise that failed a hard filter and was substituted with the nearest
   *  lower level that survives (session-only, does not persist a level change), or a pattern-gap
   *  band exception. Holds the exercise id that would otherwise have been used. */
  substitutedFor?: string;
  /** §4.7 — true for an exercise added outside the normal template (not currently produced by
   *  generation itself; reserved for Wave 4's mid-workout add-exercise flow to set on entries it
   *  appends to a generated plan). */
  unplanned?: boolean;
}

export interface PatternGapNote {
  pattern: Pattern;
  /** What the engine did about it — filled with a band, or left as a stated imbalance. */
  resolution: 'used_band' | 'stated_imbalance';
}

/**
 * §5.6 — "add or drop until within ±10% of target." Set ONLY when, after every fill/trim lever
 * the engine has (extra accessory slots, sets trimmed on required entries when they alone would
 * overshoot, sets trimmed on optional entries that would otherwise not fit), the estimate still
 * falls outside ±10% of `targetMinutes`. Named `*Deviation`, not `*Shortfall` — an `'over'`
 * deviation is an overrun, not a shortfall, and mislabeling it would read as a content limitation
 * when it's the opposite failure mode (§1.1 calls overrunning out specifically as the churn
 * risk). `reason` records why, for an `'under'` case specifically (carried-forward issue #7 —
 * an earlier version of this field called every shortfall `'thin_pool'` even when the true cause
 * was the template or the fit loop, not the library; a wrong reason sends the next person to top
 * up content that was never short):
 *   - `'thin_pool'` — every accessory slot the template offered was tried and at least one had no
 *     eligible exercise at all (selection returned nothing for it) — a genuine content limit.
 *   - `'template_exhausted'` — every offered slot *was* filled, but §5.6's exercise-count-sanity
 *     ceiling (`mainExerciseCountRange`) capped how many optional slots the template would even
 *     offer before the time budget was used up. Not a library problem — raising the ceiling or
 *     changing the template would close it, not adding exercises.
 * `'structural_minimum'` means required entries alone, even trimmed to the sets floor, still
 * exceed the ceiling (an `'over'` case — should be rare to non-existent post-ADR-0002, since the
 * 15-minute floor removes the main structural cause).
 * This must never be silent — the same rule as PATTERN GAP: report it on the plan and in the
 * §5.8 explanation line, never just return a session that quietly misses the promised time.
 */
export interface TimeBudgetDeviation {
  targetMinutes: number;
  estimatedMinutes: number;
  direction: 'under' | 'over';
  reason: 'thin_pool' | 'template_exhausted' | 'structural_minimum';
}

export interface SessionPlan {
  focus: Focus;
  effort: Effort;
  format: SessionFormat;
  targetMinutes: number;
  estimatedMinutes: number;
  warmup: SessionEntry[];
  main: SessionEntry[];
  cooldown: SessionEntry[];
  /** §5.8 — required, not optional. */
  explanation: string;
  patternGaps: PatternGapNote[];
  /** See `TimeBudgetDeviation` — absent means the estimate landed within ±10% of target. */
  timeBudgetDeviation?: TimeBudgetDeviation;
  anchorsSnapshot: Anchor[];
  engineVersion: string;
  generatedAtLocalDate: LocalDate;
}

/** §5.2 recency bucket for main-work exercises (warmup/cooldown use light rotation instead —
 *  see docs/decisions/0001-blocked-scope.md). */
export type RecencyTier = 'blocked' | 'soft' | 'preferred';

/** Internal working type: an exercise plus the derived facts selection needs about it. */
export interface Candidate {
  exercise: Exercise;
  sessionsAgo: number | null;
  tier: RecencyTier;
  performCount: number;
  enjoyment: number;
  isNovel: boolean;
  isSuppressed: boolean;
}
