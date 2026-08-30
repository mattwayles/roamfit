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
}

export interface PatternGapNote {
  pattern: Pattern;
  /** What the engine did about it — filled with a band, or left as a stated imbalance. */
  resolution: 'used_band' | 'stated_imbalance';
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
  anchorsSnapshot: Anchor[];
  engineVersion: string;
  generatedAtLocalDate: LocalDate;
}

/** Internal working type: an exercise plus the derived facts selection needs about it. */
export interface Candidate {
  exercise: Exercise;
  sessionsAgo: number | null;
  performCount: number;
  enjoyment: number;
  isNovel: boolean;
  isSuppressed: boolean;
}
