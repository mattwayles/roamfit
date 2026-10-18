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
  Difficulty,
  Exercise,
  Focus,
  Pattern,
  ProgressionFamilyId,
  Role,
} from '@roamfit/data';
import type { TrainingPreferences } from './preferences';

export type { Difficulty };

/** §8.1 difficulty feedback, 3-position control. Unset means `just_right`. */
export type DifficultyFeedback = 'too_easy' | 'just_right' | 'too_hard';

/** A single band, lightest to heaviest (§5.7). */
export type SingleBandId = 'B1' | 'B2' | 'B3' | 'B4' | 'B5';
/** Track 37i — two bands used together for more tension than the heaviest alone: B5 plus a
 *  lighter one. Tensions in parallel roughly add, so each pairing is a step above the last. */
export type StackedBandId = 'B5+B1' | 'B5+B2' | 'B5+B3' | 'B5+B4';
/** Any band prescription: a single band, or (with stacking on) a stacked pair. */
export type BandId = SingleBandId | StackedBandId;

export const SINGLE_BANDS: readonly SingleBandId[] = ['B1', 'B2', 'B3', 'B4', 'B5'];
export const STACKED_BANDS: readonly StackedBandId[] = ['B5+B1', 'B5+B2', 'B5+B3', 'B5+B4'];
/** Every band step, lightest to heaviest — single bands, then the stacked pairs above B5. All band
 *  arithmetic (next/previous band, steps across a range) reads this one order. A stacked pair is
 *  only ever reached when the user has turned stacking on (see `usableBands`). */
export const BAND_ORDER: readonly BandId[] = [...SINGLE_BANDS, ...STACKED_BANDS];

export function isStackedBand(band: BandId): band is StackedBandId {
  return (STACKED_BANDS as readonly string[]).includes(band);
}

/** The single bands a band prescription physically is: one, or the two of a stacked pair. */
export function bandParts(band: BandId): SingleBandId[] {
  return isStackedBand(band) ? (band.split('+') as SingleBandId[]) : [band];
}

/** Track 37i — the bands this user can actually be prescribed. */
export interface BandSettings {
  /** Single bands the user owns. Empty = no bands at all: band exercises are left out. */
  owned: SingleBandId[];
  /** Use stacked pairs above B5 (needs B5 and the partner band). */
  stacking: boolean;
}

/** Absent band settings mean every single band owned and no stacking: the app before 37i. */
export const DEFAULT_BAND_SETTINGS: Readonly<BandSettings> = {
  owned: [...SINGLE_BANDS],
  stacking: false,
};

/** Every band step this user can be given, in `BAND_ORDER`: owned single bands, plus — with
 *  stacking on — each stacked pair whose two bands are both owned. */
export function usableBands(settings: BandSettings | null | undefined): BandId[] {
  const s = settings ?? DEFAULT_BAND_SETTINGS;
  const owned = new Set<BandId>(s.owned);
  return BAND_ORDER.filter((b) =>
    isStackedBand(b) ? s.stacking && bandParts(b).every((p) => owned.has(p)) : owned.has(b),
  );
}

/**
 * The usable band to hand the user for a prescribed `band`: itself if usable, else the nearest
 * usable band below it (a lighter band is always safe to give), else the lightest usable band
 * above it. Unchanged when `band` is null (bodyweight) or nothing is usable.
 */
export function clampToUsableBand(band: BandId | null, usable: readonly BandId[]): BandId | null {
  if (!band || usable.length === 0 || usable.includes(band)) return band;
  const idx = BAND_ORDER.indexOf(band);
  const below = usable.filter((b) => BAND_ORDER.indexOf(b) < idx);
  if (below.length > 0) return below[below.length - 1];
  return usable[0];
}

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
  /** Exercises the user has explicitly disabled — permanently excluded from all eligibility
   *  until re-enabled. Distinct from `ExerciseState.suppressedUntil` (temporary, system-managed). */
  disabledExerciseIds: string[];
  /** Track 37i — the bands this user owns and whether they stack them. Absent = every band owned,
   *  no stacking. */
  bands?: BandSettings;
  /** Track 37f — the user's training preferences. Absent (or any field absent) = the defaults,
   *  which reproduce the engine's behaviour before preferences existed. */
  training?: Partial<TrainingPreferences>;
  /** Track 37f — seconds this user actually takes between exercises, learned from completed
   *  sessions by the store. Absent = the default 60s. */
  changeoverSec?: number;
}

/** §4.4 — per user × exercise. Never on the shared library table (invariant 7). */
export interface ExerciseState {
  exerciseId: string;
  lastPerformedAt: LocalDate | null;
  sessionsPerformed: number;
  bestSet: { reps?: number; seconds?: number; band?: BandId; at: LocalDate } | null;
  /** The band the user finished their last main working sets of this exercise on — what they
   *  actually picked up, not what was prescribed. Read by `prescribeAccessory` so an exercise with
   *  no progression family starts from the band in the user's hand rather than resetting to the
   *  lightest authored band every session. Absent/null: never trained, or bodyweight. */
  workingBand?: BandId | null;
  /** This exercise's own micro-progression state for when it runs as an accessory (no
   *  progression family) — see `progression/accessory.ts`. Its `band` is `workingBand`. Absent/null
   *  until the exercise first completes as an accessory; `prescribeAccessory` then falls back to
   *  the day's difficulty table. */
  accessoryMicro?: ProgressionMicroState | null;
  /** Consecutive sessions below target on the accessory ladder (`ProgressionState`'s
   *  `consecutiveMisses`, per exercise). */
  accessoryMisses?: number;
  /** Track 37f — qualifying sessions banked toward the accessory ladder's next step under a
   *  "patient" pace (`AccessoryProgressionState.consecutiveHits`). */
  accessoryHits?: number;
  /** -1..+1, too_hard .. too_easy. */
  difficultyEma: number;
  skipCount: number;
  swapAwayCount: number;
  removeAtApprovalCount: number;
  pinnedNote: string | null;
  /** Set by REPEATEDLY-SKIPPED (§5.2) or a pain report (§13.2). */
  suppressedUntil: LocalDate | null;
  /** Explicit, permanent user veto — set from the Exercises detail screen or the workout
   *  approval screen, cleared only by re-enabling. Distinct from `suppressedUntil`. */
  disabledAt: LocalDate | null;
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
  /** Difficulty actually prescribed to this exercise (may be capped below the session's
   *  requested difficulty). */
  difficulty: Difficulty;
  /** Sets actually prescribed (planned, not necessarily all completed) — drives trailing muscle
   *  volume the same way the prototype's `muscle_sets` does (primary=1 credit/set, secondary=0.5).
   *  Defaults to 1 if a caller can't supply it (e.g. warmup/cooldown, or legacy data). */
  sets?: number;
  /** The sets the user actually completed, in order (skipped / not-reached sets are absent). Read
   *  only by the Recommended Focus (`weeklyAreaVolume`), which weights each set by what was done.
   *  Omitted by a caller that has no set logs — that entry then counts its planned `sets`. */
  loggedSets?: LoggedSet[];
}

/** One completed set as logged. `seconds` is per side (a unilateral hold's logged total halved). */
export interface LoggedSet {
  reps: number | null;
  seconds: number | null;
  /** The band the set was done on (a reported correction, else the prescribed one); null for
   *  bodyweight. */
  band: BandId | null;
}

export interface SessionHistoryRecord {
  localDate: LocalDate;
  focus: Focus;
  difficulty: Difficulty;
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
   *  once-only first-session notice and comeback-vs-first-run distinction. */
  hasEverCompletedSession: boolean;
}

// --------------------------------------------------------------------------------------------
// Request / response
// --------------------------------------------------------------------------------------------

export type EquipmentPreference = 'any' | 'band' | 'bodyweight';

export interface GenerationRequest {
  focus: Focus;
  /** Drives both exercise-selection eligibility/weighting (easy/medium/hard match the exercise
   *  library's own `difficulty` field) and prescription (sets/reps/rest/tempo). */
  difficulty: Difficulty;
  /** Target session length in minutes, warmup and cooldown included. */
  targetMinutes: number;
  equipmentPreference?: EquipmentPreference;
  /** §9.5 — same pipeline, minimal template (1 warmup + 3 main + 1 cooldown), ~7min, `normal`. */
  quickSession?: boolean;
  /** Track 19 — weave a few cardio (`conditioning`) exercises, evenly spaced, through a strength
   *  session. Ignored for the Cardio focus (already all cardio) and for Quick Session. */
  cardioAddOn?: boolean;
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
  /** The difficulty actually prescribed to this entry — may be capped below the session's
   *  requested difficulty (§13.1 bodyweight-bearing cap, or 48h recovery). */
  difficulty: Difficulty;
  progressionFamilyId: ProgressionFamilyId | null;
  progressionLevelIdAtTime: string | null;
  pattern: Pattern;
  anchorClass: AnchorClass;
  unilateral: boolean;
  estimatedSec: number;
  /** Track 37f — the changeover allowance `estimatedSec` was computed with, when it is this
   *  user's learned value rather than the default 60s. Carried so every later re-estimate (time
   *  fit trimming a set, an approval edit, a swap) uses the same allowance. */
  transitionSec?: number;
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
  difficulty: Difficulty;
  format: SessionFormat;
  /** §9.5 — this session came from the Quick Session shortcut (fixed ~7min budget, no pickers),
   *  not a regular targetMinutes/difficulty pick. Carried onto the persisted session so the
   *  calendar heatmap (§14.1.6) can mark it distinctly from a same-focus regular session. */
  isQuick: boolean;
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
  isNovel: boolean;
  isSuppressed: boolean;
}
