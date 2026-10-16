/**
 * A per-exercise micro-progression ladder, for every band/bodyweight exercise whose load is not
 * governed by a family's current rung:
 *
 * - **Accessories** — main exercises with no progression family. They used to be prescribed off
 *   the day's difficulty table every session, so meeting every set changed nothing, forever.
 * - **Passed-rung exercises** — a band exercise from a rung *below* its family's current one,
 *   drawn for variety. Unlocking the next rung doesn't retire it, but the family's state is
 *   tracked against the current rung, and projecting that onto this exercise capped it at its
 *   authored range: once passed, it could never get heavier again.
 *
 * Both climb the same §6.2 ladder a family does, with the same verdicts (`applySessionResult`'s
 * rules) and the same `microAdvance`/`microRegress` steps, stored per exercise on `ExerciseState`.
 * The one difference: the band runs over the **whole band set (B1-B5)**, not the exercise's
 * authored range. An authored range's top is where a family's *current rung* hands over to the
 * next, harder exercise; an exercise that has no next exercise — or whose next one is already
 * unlocked — keeps climbing bands to the heaviest. So: reps → next band → … → B5, then tempo →
 * rest → sets, then it holds (the §6.7 mastery treatment). At B1 with nothing left to give back,
 * repeated misses hold rather than drop further.
 *
 * Cardio is excluded: it is prescribed as intervals off the day's difficulty
 * (`CARDIO_INTERVAL_TABLE`), and a strength ladder with its 45s rests would undo that.
 */
import type { Exercise, ProgressionFamily } from '@roamfit/data';
import { isCardioExercise } from '@roamfit/data';
import { BAND_ORDER } from '../types';
import type { BandId, DifficultyFeedback, ProgressionMicroState } from '../types';
import {
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

const LIGHTEST_BAND = BAND_ORDER[0];
const HEAVIEST_BAND = BAND_ORDER[BAND_ORDER.length - 1];

/** The exercise as this ladder sees it: a band exercise's range opened to the whole band set, so
 *  `microAdvance`/`microRegress`/`isAtBottomMicroStep` step bands B1-B5. */
function onOpenBandRange(exercise: Exercise): Exercise {
  return exercise.equipment === 'band'
    ? { ...exercise, band: `${LIGHTEST_BAND}-${HEAVIEST_BAND}` }
    : exercise;
}

/**
 * A band exercise from a rung below `currentLevelId` in its own family — already passed, so it
 * climbs its own ladder (see the module doc) rather than the family's projected tier. Bodyweight
 * passed-rung exercises keep the projection: this is about band headroom.
 */
export function isPassedRungBandExercise(
  exercise: Exercise,
  family: ProgressionFamily,
  currentLevelId: string,
): boolean {
  if (exercise.equipment !== 'band' || exercise.progression_family !== family.id) return false;
  const own = family.levels.findIndex((l) => l.exercise_ids.includes(exercise.id));
  const current = family.levels.findIndex((l) => l.level_id === currentLevelId);
  return own >= 0 && current >= 0 && own < current;
}

/**
 * Where a passed-rung exercise starts its own ladder the first time it is drawn: the bottom of the
 * next band above its authored range (B5 at most), default pace — it was mastered at the top of
 * that range on the way past. A heavier band the user has already finished it on wins.
 */
export function seedPassedRungMicro(
  exercise: Exercise,
  workingBand: BandId | null | undefined,
): ProgressionMicroState {
  const top = parseBandRange(exercise.band)?.[1] ?? LIGHTEST_BAND;
  const nextIdx = Math.min(BAND_ORDER.indexOf(top) + 1, BAND_ORDER.length - 1);
  const idx = Math.max(nextIdx, workingBand ? BAND_ORDER.indexOf(workingBand) : -1);
  return {
    repTarget: rangeForExercise(exercise).low,
    band: BAND_ORDER[idx],
    tempoSec: DEFAULT_TEMPO_SEC,
    restSec: DEFAULT_REST_SEC,
    sets: DEFAULT_SETS,
  };
}

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
 * `reconcileMicroToObservedBand`, but with no clamp to the authored range: this ladder's band
 * runs B1-B5, and the band the user picked up is a position on it.
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

/** §6.3's verdict rules, applied to one exercise's own ladder. Mirrors `applySessionResult` step
 *  for step, over the open band range. */
export function applyAccessorySessionResult(
  input: AccessoryProgressionState,
  exercise: Exercise,
  perf: AccessoryPerformance,
): ApplyAccessoryResult {
  const ladder = onOpenBandRange(exercise);
  const micro = adoptFinalBand(input.micro, exercise, perf);
  const misses = input.consecutiveMisses;

  const shouldAdvance = perf.allSetsMetTarget && perf.difficultyFeedback !== 'too_hard';
  const shouldRegress =
    perf.anySetBelowTarget && (misses >= 1 || perf.difficultyFeedback === 'too_hard');

  if (shouldAdvance) {
    const step = microAdvance(micro, ladder);
    // Past the top only on the heaviest band with every pace knob spent: nothing heavier exists.
    return {
      state: { micro: step.micro, consecutiveMisses: 0 },
      event: { kind: step.levelChange === 'up' ? 'mastery_pr_check' : 'micro_advance' },
    };
  }

  if (shouldRegress) {
    // At B1 (or bodyweight) with every knob at its floor there is nothing left to give back, and
    // no lower rung to drop to: hold.
    if (isAtBottomMicroStep(micro, ladder)) {
      return { state: { micro, consecutiveMisses: misses + 1 }, event: { kind: 'hold' } };
    }
    return {
      state: { micro: microRegress(micro, ladder).micro, consecutiveMisses: misses + 1 },
      event: { kind: 'micro_regress' },
    };
  }

  if (perf.anySetBelowTarget) {
    return { state: { micro, consecutiveMisses: misses + 1 }, event: { kind: 'hold' } };
  }
  return { state: { micro, consecutiveMisses: 0 }, event: { kind: 'hold' } };
}
