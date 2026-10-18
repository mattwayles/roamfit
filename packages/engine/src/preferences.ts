/**
 * Track 37f — the user's training preferences: the parameters that used to be fixed constants and
 * are now the user's to set (Settings → Training preferences, and onboarding's goal step). Every
 * field has a default that reproduces the engine's behaviour before this track exactly, so a user
 * who never opens the screen — and every caller that passes no preferences at all — gets what the
 * app always did. Those defaults were already chosen for a beginner (8-12 reps, 48h recovery,
 * one step per qualifying session), so they stay the beginner defaults.
 *
 * Progression state is NOT re-denominated by any of this. A family's micro-state keeps climbing
 * the same 8-12 rep / 20-45s hold ladder it always has; the goal is applied at prescription
 * (`applyTrainingToMainEntry`) as an offset onto that ladder position, a rest multiplier and a
 * sets bonus. Completion judges a session against what was prescribed, so meeting a 5-rep
 * strength target advances the ladder exactly as meeting an 8-rep one did — and switching goal
 * later never strands or corrupts anyone's progress.
 *
 * What is deliberately not here: the §13.1 bodyweight-bearing effort cap (invariant 3 — a safety
 * filter, never a preference), and anything that would let a preference relax a hard filter.
 */
import type { Exercise } from '@roamfit/data';
import { isCardioExercise } from '@roamfit/data';
import type { SessionEntry } from './types';
import { estimateEntrySec } from './prescription/prescribe';
import {
  HARD_COOLDOWN_SESSIONS,
  RECOVERY_WINDOW_DAYS,
  SOFT_COOLDOWN_SESSIONS,
} from './selection/constants';

/** What the user is training for. Decides the rep/hold range, rest and set count. */
export type TrainingGoal = 'general' | 'strength' | 'muscle' | 'endurance';
/** A multiplier on rest between working sets, on top of the goal's. */
export type RestPreference = 'shorter' | 'standard' | 'longer';
/** How often the same main exercise may come back (the §5.2 cooldown windows). */
export type VarietyPreference = 'consistent' | 'balanced' | 'varied';
/** How long a muscle trained hard is eased off afterwards (the §5.2 recovery window). */
export type RecoveryPreference = 'quick' | 'standard' | 'extra';
/** How many qualifying sessions each step up a ladder takes. */
export type ProgressionPace = 'steady' | 'patient';
/** How much of a session the warm-up and cool-down take. */
export type WarmupPreference = 'short' | 'standard' | 'extended';

export interface TrainingPreferences {
  goal: TrainingGoal;
  rest: RestPreference;
  variety: VarietyPreference;
  recovery: RecoveryPreference;
  pace: ProgressionPace;
  warmup: WarmupPreference;
}

export const DEFAULT_TRAINING_PREFERENCES: Readonly<TrainingPreferences> = {
  goal: 'general',
  rest: 'standard',
  variety: 'balanced',
  recovery: 'standard',
  pace: 'steady',
  warmup: 'standard',
};

/** Fill any missing field from the defaults (a stored record written before a field existed, or
 *  a caller that passes nothing). */
export function resolveTrainingPreferences(
  prefs: Partial<TrainingPreferences> | null | undefined,
): TrainingPreferences {
  return { ...DEFAULT_TRAINING_PREFERENCES, ...(prefs ?? {}) };
}

export interface GoalAdjustment {
  /** Added to a rep target on the 8-12 ladder (`general` and `muscle`: 0). */
  repOffset: number;
  /** Added to a hold target on the 20-45s ladder. */
  holdOffsetSec: number;
  restMultiplier: number;
  /** Extra working sets per main exercise. */
  setsBonus: number;
}

/**
 * The four goals, as offsets onto the existing ladder so every rung stays a one-rep (or 5s) step:
 *  - General fitness (default): 8-12 reps, 20-45s holds, the existing rests and 3 sets.
 *  - Strength: 5-9 reps with longer rest — heavier, fewer reps, more recovery between sets.
 *  - Muscle: 8-12 reps with an extra set — hypertrophy is driven by total working sets.
 *  - Endurance: 15-19 reps, 30-55s holds, shorter rest.
 */
export const GOAL_ADJUSTMENTS: Readonly<Record<TrainingGoal, GoalAdjustment>> = {
  general: { repOffset: 0, holdOffsetSec: 0, restMultiplier: 1, setsBonus: 0 },
  strength: { repOffset: -3, holdOffsetSec: -5, restMultiplier: 1.5, setsBonus: 0 },
  muscle: { repOffset: 0, holdOffsetSec: 0, restMultiplier: 1, setsBonus: 1 },
  endurance: { repOffset: 7, holdOffsetSec: 10, restMultiplier: 0.67, setsBonus: 0 },
};

const REST_MULTIPLIER: Readonly<Record<RestPreference, number>> = {
  shorter: 0.75,
  standard: 1,
  longer: 1.33,
};

/** Floors, so no combination of preferences prescribes a degenerate set. */
const MIN_REST_SEC = 15;
const MIN_REPS = 3;
const MIN_HOLD_SEC = 10;
const MAX_SETS = 6;

function roundTo5(n: number): number {
  return Math.round(n / 5) * 5;
}

/**
 * The goal and rest preference applied to one main working entry, after the ladder (or the
 * difficulty table, for a first-time accessory) has prescribed it and before time fit sums it.
 * Warm-ups, cool-downs and cardio intervals are returned unchanged: they are not working sets,
 * and a cardio interval's work/rest *is* its difficulty. `estimatedSec` is recomputed whenever
 * anything changed, so time fit sees the real cost.
 */
export function applyTrainingToMainEntry(
  entry: SessionEntry,
  exercise: Exercise,
  prefs: TrainingPreferences,
): SessionEntry {
  if (entry.role !== 'main' || isCardioExercise(exercise)) return entry;
  const goal = GOAL_ADJUSTMENTS[prefs.goal];
  const restMultiplier = goal.restMultiplier * REST_MULTIPLIER[prefs.rest];
  if (
    goal.repOffset === 0 &&
    goal.holdOffsetSec === 0 &&
    goal.setsBonus === 0 &&
    restMultiplier === 1
  ) {
    return entry;
  }
  const repTarget =
    entry.repTarget !== undefined
      ? Math.max(MIN_REPS, entry.repTarget + goal.repOffset)
      : undefined;
  const durationSec =
    entry.durationSec !== undefined
      ? Math.max(MIN_HOLD_SEC, entry.durationSec + goal.holdOffsetSec)
      : undefined;
  const restSec = Math.max(MIN_REST_SEC, roundTo5(entry.restSec * restMultiplier));
  const sets = Math.min(MAX_SETS, entry.sets + goal.setsBonus);
  const next = { ...entry, repTarget, durationSec, restSec, sets };
  return { ...next, estimatedSec: estimateEntrySec(next) };
}

export interface CooldownWindows {
  /** A main exercise used within this many sessions is not used again. */
  hard: number;
  /** …and within this many, only to fill a slot nothing else covers. */
  soft: number;
}

/**
 * Variety. `balanced` is the §5.2 rule as it always was (2 / 5). `consistent` lets a beginner meet
 * the same movements session after session while they learn them — repetition is how a movement
 * is learned — and `varied` spreads them further for someone who wants novelty. The current rung
 * of a ladder stays reachable regardless (see `resolveSlot.ts`), so progression is never
 * interrupted by the variety setting.
 */
export function cooldownWindowsFor(variety: VarietyPreference): CooldownWindows {
  switch (variety) {
    case 'consistent':
      return { hard: 0, soft: 2 };
    case 'balanced':
      return { hard: HARD_COOLDOWN_SESSIONS, soft: SOFT_COOLDOWN_SESSIONS };
    case 'varied':
      return { hard: 3, soft: 8 };
  }
}

/** Recovery: `standard` is the §5.2 48h window. */
export function recoveryWindowDaysFor(recovery: RecoveryPreference): number {
  switch (recovery) {
    case 'quick':
      return 1;
    case 'standard':
      return RECOVERY_WINDOW_DAYS;
    case 'extra':
      return 3;
  }
}

/** Qualifying sessions per ladder step: `steady` is one (the rule as it always was). */
export function sessionsPerStepFor(pace: ProgressionPace): number {
  return pace === 'patient' ? 2 : 1;
}

/** Warm-up / cool-down share of the session, as `[fraction, min, max]` minutes. `standard` is the
 *  §5.6 budget as it always was. */
const WARMUP_SHAPE: Readonly<Record<WarmupPreference, [number, number, number]>> = {
  short: [0.08, 2, 5],
  standard: [0.12, 3, 8],
  extended: [0.18, 4, 12],
};
const COOLDOWN_SHAPE: Readonly<Record<WarmupPreference, [number, number, number]>> = {
  short: [0.07, 2, 5],
  standard: [0.1, 3, 7],
  extended: [0.15, 4, 10],
};

function shaped(targetMinutes: number, [fraction, low, high]: [number, number, number]): number {
  return Math.min(Math.max(Math.round(fraction * targetMinutes), low), high);
}

export function warmupMinutesFor(targetMinutes: number, pref: WarmupPreference): number {
  return shaped(targetMinutes, WARMUP_SHAPE[pref]);
}

export function cooldownMinutesFor(targetMinutes: number, pref: WarmupPreference): number {
  return shaped(targetMinutes, COOLDOWN_SHAPE[pref]);
}
