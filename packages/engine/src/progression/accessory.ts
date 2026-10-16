/**
 * Micro-progression for accessories — main exercises with no progression family.
 *
 * A family exercise climbs §6.2's ladder (reps → band → tempo → rest → sets → next level) through
 * `applySessionResult`. An accessory used to have nothing: it was prescribed off the day's
 * difficulty table every session, so a user who met every set and said "just right" was handed
 * the identical prescription next time, forever. This gives it the same ladder, per exercise
 * (stored on `ExerciseState`, not per family), with the same advance/regress verdicts and the same
 * `microAdvance`/`microRegress` steps.
 *
 * What differs is only what a family gets from its *levels*:
 * - Past the top of the micro ladder a family moves to the next rung's exercise. An accessory has
 *   no next rung, so its "next level" is itself one band heavier, from a fresh micro-state (bottom
 *   of the rep/hold range, default pace) — a new band is a new level of load. Bodyweight, or
 *   already on the heaviest band, holds at the top (the §6.7 mastery treatment).
 * - Below the bottom, a family drops a rung; an accessory drops one band, reps at the top of the
 *   range (the same pairing `microRegress` uses for a band step down). At B1 or bodyweight it holds.
 *
 * Cardio is not an accessory here: it is prescribed as intervals off the day's difficulty
 * (`CARDIO_INTERVAL_TABLE`), and a strength ladder with its 45s rests would undo that.
 */
import type { Exercise } from '@roamfit/data';
import { isCardioExercise } from '@roamfit/data';
import { BAND_ORDER } from '../types';
import type { BandId, DifficultyFeedback, ProgressionMicroState } from '../types';
import {
  defaultMicroForExercise,
  isAtBottomMicroStep,
  microAdvance,
  microRegress,
  parseBandRange,
  rangeForExercise,
} from './micro';
import {
  BODYWEIGHT_REST_FLOOR_SEC,
  BODYWEIGHT_SETS_CAP,
  BODYWEIGHT_TEMPO_CAP_SEC,
  CONSECUTIVE_BOTTOM_REGRESSIONS_TO_DROP_LEVEL,
  DEFAULT_REST_SEC,
  DEFAULT_SETS,
  DEFAULT_TEMPO_SEC,
} from './constants';

export interface AccessoryProgressionState {
  micro: ProgressionMicroState;
  consecutiveMisses: number;
}

/** What completion reports about one accessory entry's working sets — the accessory twin of
 *  `SessionPerformance`. */
export interface AccessoryPerformance {
  allSetsMetTarget: boolean;
  anySetBelowTarget: boolean;
  difficultyFeedback: DifficultyFeedback;
  /** The band the entry's final completed set was done on (reported, else prescribed). */
  finalBand?: BandId | null;
  /** Every completed set was done on `finalBand` — so meeting the target was done at that band,
   *  not partly on a lighter one before switching. */
  finalBandHeldThroughout?: boolean;
}

export type AccessoryProgressionEvent =
  | { kind: 'hold' }
  | { kind: 'micro_advance' }
  | { kind: 'micro_regress' }
  | { kind: 'band_up'; band: BandId }
  | { kind: 'band_down'; band: BandId }
  | { kind: 'mastery_pr_check' };

export interface ApplyAccessoryResult {
  state: AccessoryProgressionState;
  event: AccessoryProgressionEvent;
}

/** Whether this exercise climbs the accessory ladder when it runs as an accessory. */
export function progressesAsAccessory(exercise: Exercise): boolean {
  return !isCardioExercise(exercise);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * The ladder position an accessory starts from, read off the prescription it was first trained
 * at (the day's difficulty table) and clamped into the ladder's own ranges: reps 8-12 or 20-45s,
 * tempo 3-4s, rest 30-45s, sets 3-4. Seeding from what the user actually did — rather than the
 * bottom of the ladder, as a family's level 1 does — means a 3x12 they already handled is where
 * the climb continues, not a drop to 3x8.
 */
export function seedAccessoryMicro(
  exercise: Exercise,
  prescribed: {
    repTarget?: number | null;
    durationSec?: number | null;
    tempoSec: number;
    restSec: number;
    sets: number;
    band: BandId | null;
  },
): ProgressionMicroState {
  const { low, high } = rangeForExercise(exercise);
  const value = exercise.metric === 'time' ? prescribed.durationSec : prescribed.repTarget;
  return {
    repTarget: clamp(value ?? low, low, high),
    band:
      exercise.equipment === 'band'
        ? (prescribed.band ?? parseBandRange(exercise.band)?.[0] ?? null)
        : null,
    tempoSec: clamp(prescribed.tempoSec, DEFAULT_TEMPO_SEC, BODYWEIGHT_TEMPO_CAP_SEC),
    restSec: clamp(prescribed.restSec, BODYWEIGHT_REST_FLOOR_SEC, DEFAULT_REST_SEC),
    sets: clamp(prescribed.sets, DEFAULT_SETS, BODYWEIGHT_SETS_CAP),
  };
}

/**
 * Adopt the band the user finished on before judging the session — the accessory form of
 * `reconcileMicroToObservedBand`, but with no clamp to the authored range: an accessory's
 * remembered band is whatever the user picked up (track 33), and the range only says where its
 * in-ladder band steps stop.
 *
 * The rep target moves with the band as the family rule does (heavier → bottom of the range,
 * lighter → top) with one exception: a heavier band held for every set, with every set meeting the
 * target, keeps the target. The user has just shown that load *at* that count, and resetting it to
 * the bottom would hand them an easier prescription than the one they finished — 3x12 done on B2
 * coming back as 3x9 on B2, exactly the "nothing got harder" this ladder exists to fix.
 */
function adoptFinalBand(
  micro: ProgressionMicroState,
  exercise: Exercise,
  perf: AccessoryPerformance,
): ProgressionMicroState {
  const { finalBand } = perf;
  if (exercise.equipment !== 'band' || !finalBand) return micro;
  const current = micro.band ?? parseBandRange(exercise.band)?.[0] ?? null;
  if (!current || finalBand === current) return { ...micro, band: current };
  const { low, high } = rangeForExercise(exercise);
  const heavier = BAND_ORDER.indexOf(finalBand) > BAND_ORDER.indexOf(current);
  if (heavier && perf.allSetsMetTarget && perf.finalBandHeldThroughout) {
    return { ...micro, band: finalBand };
  }
  return { ...micro, band: finalBand, repTarget: heavier ? low : high };
}

/** §6.3's verdict rules, applied to one accessory. Mirrors `applySessionResult` step for step. */
export function applyAccessorySessionResult(
  input: AccessoryProgressionState,
  exercise: Exercise,
  perf: AccessoryPerformance,
): ApplyAccessoryResult {
  const micro = adoptFinalBand(input.micro, exercise, perf);
  const misses = input.consecutiveMisses;

  const shouldAdvance = perf.allSetsMetTarget && perf.difficultyFeedback !== 'too_hard';
  const shouldRegress =
    perf.anySetBelowTarget && (misses >= 1 || perf.difficultyFeedback === 'too_hard');

  if (shouldAdvance) {
    const step = microAdvance(micro, exercise);
    if (step.levelChange !== 'up') {
      return {
        state: { micro: step.micro, consecutiveMisses: 0 },
        event: { kind: 'micro_advance' },
      };
    }
    const idx = micro.band ? BAND_ORDER.indexOf(micro.band) : -1;
    if (exercise.equipment === 'band' && idx >= 0 && idx < BAND_ORDER.length - 1) {
      const band = BAND_ORDER[idx + 1];
      return {
        state: { micro: { ...defaultMicroForExercise(exercise), band }, consecutiveMisses: 0 },
        event: { kind: 'band_up', band },
      };
    }
    return {
      state: { micro: step.micro, consecutiveMisses: 0 },
      event: { kind: 'mastery_pr_check' },
    };
  }

  if (shouldRegress) {
    const step = microRegress(micro, exercise);
    // `microRegress` reports `down` at the bottom of the reps when the band is already below the
    // authored range — nothing left to give back inside the ladder, same as the bottom proper.
    if (isAtBottomMicroStep(micro, exercise) || step.levelChange === 'down') {
      const idx = micro.band ? BAND_ORDER.indexOf(micro.band) : -1;
      if (misses + 1 >= CONSECUTIVE_BOTTOM_REGRESSIONS_TO_DROP_LEVEL && idx > 0) {
        const band = BAND_ORDER[idx - 1];
        return {
          state: {
            micro: { ...micro, band, repTarget: rangeForExercise(exercise).high },
            consecutiveMisses: 0,
          },
          event: { kind: 'band_down', band },
        };
      }
      return { state: { micro, consecutiveMisses: misses + 1 }, event: { kind: 'hold' } };
    }
    return {
      state: { micro: step.micro, consecutiveMisses: misses + 1 },
      event: { kind: 'micro_regress' },
    };
  }

  if (perf.anySetBelowTarget) {
    return { state: { micro, consecutiveMisses: misses + 1 }, event: { kind: 'hold' } };
  }
  return { state: { micro, consecutiveMisses: 0 }, event: { kind: 'hold' } };
}
