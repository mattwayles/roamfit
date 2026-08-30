/**
 * §6.2 micro-progression within a level — applied fully before a level ever changes. Distinct
 * orders for band vs bodyweight exercises. See constants.ts for the numeric choices spec.md
 * leaves unstated.
 */
import type { Exercise } from '@roamfit/data';
import { BAND_ORDER } from '../types';
import type { BandId, ProgressionMicroState } from '../types';
import {
  BODYWEIGHT_REST_FLOOR_SEC,
  BODYWEIGHT_SETS_CAP,
  BODYWEIGHT_TEMPO_CAP_SEC,
  DEFAULT_REST_SEC,
  DEFAULT_SETS,
  DEFAULT_TEMPO_SEC,
  PROGRESSION_REP_HIGH,
  PROGRESSION_REP_LOW,
  PROGRESSION_TIME_HIGH_SEC,
  PROGRESSION_TIME_LOW_SEC,
} from './constants';

function rangeForExercise(exercise: Exercise): { low: number; high: number } {
  return exercise.metric === 'time'
    ? { low: PROGRESSION_TIME_LOW_SEC, high: PROGRESSION_TIME_HIGH_SEC }
    : { low: PROGRESSION_REP_LOW, high: PROGRESSION_REP_HIGH };
}

/** Parses a suggested band range like "B1-B3" into [min, max]. Single band ("B2") returns
 *  [B2, B2]. `null` (bodyweight) returns null. */
export function parseBandRange(band: string | null): [BandId, BandId] | null {
  if (!band) return null;
  const parts = band.split('-');
  const lo = parts[0] as BandId;
  const hi = (parts[1] ?? parts[0]) as BandId;
  return [lo, hi];
}

/** The starting micro-state for a freshly-entered level — the §5.4 `normal` baseline, at the
 *  bottom of the rep/hold range and the lightest band in the exercise's suggested range. */
export function defaultMicroForExercise(exercise: Exercise): ProgressionMicroState {
  const { low } = rangeForExercise(exercise);
  const bandRange = parseBandRange(exercise.band);
  return {
    repTarget: low,
    band: bandRange ? bandRange[0] : null,
    tempoSec: DEFAULT_TEMPO_SEC,
    restSec: DEFAULT_REST_SEC,
    sets: DEFAULT_SETS,
  };
}

export type LevelChangeDirection = 'up' | 'down' | null;

export interface MicroStepResult {
  micro: ProgressionMicroState;
  /** Set when this step would move past the top (or bottom) of what micro-progression alone can
   *  express within the current level — the caller (rules.ts) decides what a level change means
   *  (advance, drop, or — at the top/bottom of the ladder — hold for mastery/floor). */
  levelChange: LevelChangeDirection;
}

/** One micro-progression step forward, per §6.2's order (band: reps → band+1 (reps reset) →
 *  … → next level; bodyweight: reps → tempo+1s → rest−15s → sets+1 → next level). */
export function microAdvance(micro: ProgressionMicroState, exercise: Exercise): MicroStepResult {
  const { high, low } = rangeForExercise(exercise);
  if (exercise.equipment === 'band') {
    if (micro.repTarget < high) {
      return { micro: { ...micro, repTarget: micro.repTarget + 1 }, levelChange: null };
    }
    const range = parseBandRange(exercise.band);
    const maxBand = range?.[1] ?? micro.band;
    if (micro.band && maxBand && BAND_ORDER.indexOf(micro.band) < BAND_ORDER.indexOf(maxBand)) {
      const nextBand = BAND_ORDER[BAND_ORDER.indexOf(micro.band) + 1];
      return { micro: { ...micro, band: nextBand, repTarget: low }, levelChange: null };
    }
    return { micro, levelChange: 'up' };
  }
  // Bodyweight.
  if (micro.repTarget < high) {
    return { micro: { ...micro, repTarget: micro.repTarget + 1 }, levelChange: null };
  }
  if (micro.tempoSec < BODYWEIGHT_TEMPO_CAP_SEC) {
    return { micro: { ...micro, tempoSec: micro.tempoSec + 1 }, levelChange: null };
  }
  if (micro.restSec > BODYWEIGHT_REST_FLOOR_SEC) {
    return {
      micro: { ...micro, restSec: Math.max(BODYWEIGHT_REST_FLOOR_SEC, micro.restSec - 15) },
      levelChange: null,
    };
  }
  if (micro.sets < BODYWEIGHT_SETS_CAP) {
    return { micro: { ...micro, sets: micro.sets + 1 }, levelChange: null };
  }
  return { micro, levelChange: 'up' };
}

/** One micro-progression step backward — the exact reverse order of `microAdvance`. */
export function microRegress(micro: ProgressionMicroState, exercise: Exercise): MicroStepResult {
  const { low } = rangeForExercise(exercise);
  if (exercise.equipment === 'band') {
    if (micro.repTarget > low) {
      return { micro: { ...micro, repTarget: micro.repTarget - 1 }, levelChange: null };
    }
    const range = parseBandRange(exercise.band);
    const minBand = range?.[0] ?? micro.band;
    if (micro.band && minBand && BAND_ORDER.indexOf(micro.band) > BAND_ORDER.indexOf(minBand)) {
      const { high } = rangeForExercise(exercise);
      const prevBand = BAND_ORDER[BAND_ORDER.indexOf(micro.band) - 1];
      return { micro: { ...micro, band: prevBand, repTarget: high }, levelChange: null };
    }
    return { micro, levelChange: 'down' };
  }
  // Bodyweight — reverse of sets+1 → rest-15 → tempo+1 → reps.
  if (micro.sets > DEFAULT_SETS) {
    return { micro: { ...micro, sets: micro.sets - 1 }, levelChange: null };
  }
  if (micro.restSec < DEFAULT_REST_SEC) {
    return { micro: { ...micro, restSec: micro.restSec + 15 }, levelChange: null };
  }
  if (micro.tempoSec > DEFAULT_TEMPO_SEC) {
    return { micro: { ...micro, tempoSec: micro.tempoSec - 1 }, levelChange: null };
  }
  if (micro.repTarget > low) {
    return { micro: { ...micro, repTarget: micro.repTarget - 1 }, levelChange: null };
  }
  return { micro, levelChange: 'down' };
}

/** True once every micro knob is at its floor for this level (used to detect the "two
 *  consecutive regressions at the bottom micro-step" drop-a-level trigger, §6.3). */
export function isAtBottomMicroStep(micro: ProgressionMicroState, exercise: Exercise): boolean {
  const { low } = rangeForExercise(exercise);
  if (exercise.equipment === 'band') {
    const range = parseBandRange(exercise.band);
    const minBand = range?.[0] ?? micro.band;
    return micro.repTarget <= low && (!micro.band || !minBand || micro.band === minBand);
  }
  return (
    micro.repTarget <= low &&
    micro.tempoSec <= DEFAULT_TEMPO_SEC &&
    micro.restSec >= DEFAULT_REST_SEC &&
    micro.sets <= DEFAULT_SETS
  );
}
