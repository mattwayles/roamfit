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

/**
 * The band to reason about for a band exercise when `micro.band` is `null`.
 *
 * `micro.band` is seeded from the level's *anchor* (`defaultMicroForExercise`), so it is normally
 * non-null exactly when the anchor is a band exercise. The two can fall out of step when a level's
 * anchor is re-pointed from a bodyweight exercise to a band one: state stored before the change
 * still carries `band: null` against an anchor that now has a band range. Without this fallback
 * that state reads as "no band left to climb", which makes `microAdvance` skip the whole band
 * ladder into a level-up and `isAtBottomMicroStep` report a floor that is not one.
 *
 * The fallback is the exercise's own lightest authored band — the same choice `prescribe.ts`
 * already makes when it clamps a null band onto a band sibling, so the progression state converges
 * on the band the user was actually being prescribed all along.
 */
function bandForExercise(micro: ProgressionMicroState, exercise: Exercise): BandId | null {
  if (micro.band) return micro.band;
  return parseBandRange(exercise.band)?.[0] ?? null;
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
    const band = bandForExercise(micro, exercise);
    const maxBand = range?.[1] ?? band;
    if (band && maxBand && BAND_ORDER.indexOf(band) < BAND_ORDER.indexOf(maxBand)) {
      const nextBand = BAND_ORDER[BAND_ORDER.indexOf(band) + 1];
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
    const band = bandForExercise(micro, exercise);
    const minBand = range?.[0] ?? band;
    if (band && minBand && BAND_ORDER.indexOf(band) > BAND_ORDER.indexOf(minBand)) {
      const { high } = rangeForExercise(exercise);
      const prevBand = BAND_ORDER[BAND_ORDER.indexOf(band) - 1];
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

/**
 * §6.2 — pull the micro-state's band into line with the band the user actually trained with.
 *
 * The prescription says B2; the user picks up B3 because that is what is in the bag, or because B2
 * felt like nothing. Their next session should start from the band they *used*, not the one that
 * was suggested and ignored — otherwise the app re-prescribes B2 forever and the user re-corrects
 * it forever.
 *
 * The rep target moves with the band exactly as it does when micro-progression itself changes
 * band (`microAdvance`/`microRegress`): heavier band, back to the bottom of the range; lighter
 * band, up to the top. Band and reps are one prescription, so adopting half of it would leave a
 * pairing the progression rules never produce.
 *
 * Clamped to the exercise's own suggested range — the library, not the user's grab-bag, decides
 * what is a sane load for a movement (invariant 2), and a band outside it means "as heavy/light as
 * this exercise goes". No-ops for bodyweight work, for an unknown observed band, and when the
 * observed band is the prescribed one, which is the overwhelmingly common case.
 */
export function reconcileMicroToObservedBand(
  micro: ProgressionMicroState,
  exercise: Exercise,
  observedBand: BandId | null | undefined,
): ProgressionMicroState {
  if (exercise.equipment !== 'band' || !observedBand) return micro;
  const current = bandForExercise(micro, exercise);
  if (!current) return micro;
  const range = parseBandRange(exercise.band);
  let target = observedBand;
  if (range) {
    const [lo, hi] = range;
    if (BAND_ORDER.indexOf(target) < BAND_ORDER.indexOf(lo)) target = lo;
    if (BAND_ORDER.indexOf(target) > BAND_ORDER.indexOf(hi)) target = hi;
  }
  if (target === micro.band) return micro;
  // A null `micro.band` that resolves to the same band the user trained with still needs writing
  // back: the state is being repaired to the shape its anchor now has, even though nothing moved.
  if (target === current) return { ...micro, band: target };
  const { low, high } = rangeForExercise(exercise);
  const heavier = BAND_ORDER.indexOf(target) > BAND_ORDER.indexOf(current);
  return { ...micro, band: target, repTarget: heavier ? low : high };
}

/** True once every micro knob is at its floor for this level (used to detect the "two
 *  consecutive regressions at the bottom micro-step" drop-a-level trigger, §6.3). */
export function isAtBottomMicroStep(micro: ProgressionMicroState, exercise: Exercise): boolean {
  const { low } = rangeForExercise(exercise);
  if (exercise.equipment === 'band') {
    const band = bandForExercise(micro, exercise);
    const range = parseBandRange(exercise.band);
    const minBand = range?.[0] ?? band;
    return micro.repTarget <= low && (!band || !minBand || band === minBand);
  }
  return (
    micro.repTarget <= low &&
    micro.tempoSec <= DEFAULT_TEMPO_SEC &&
    micro.restSec >= DEFAULT_REST_SEC &&
    micro.sets <= DEFAULT_SETS
  );
}

/**
 * §6.4/§14.1.3 Next Unlock substrate — *"Push-ups: 2 sessions from archer push-ups."* A pure
 * count of how many consecutive qualifying (all-sets-at-top, not `too_hard`) sessions it would
 * take from `micro`'s current position to trigger a level change, simulated by repeatedly
 * applying `microAdvance` until it reports `levelChange`. This is a best-case estimate (assumes
 * every intervening session hits) — the honest, monotonic framing §14 asks for ("N sessions
 * *from*", not a promise), not a prediction of elapsed calendar time.
 *
 * Returns `null` when there is no next level to count toward (already at the ladder's max — the
 * caller should show the §6.7 Mastery treatment instead) or when a runaway simulation would
 * otherwise be possible (belt-and-braces cap; no known exercise config gets remotely close).
 */
const NEXT_LEVEL_SIMULATION_STEP_CAP = 100;

export function microStepsToNextLevel(
  micro: ProgressionMicroState,
  exercise: Exercise,
): number | null {
  let current = micro;
  for (let steps = 1; steps <= NEXT_LEVEL_SIMULATION_STEP_CAP; steps += 1) {
    const step = microAdvance(current, exercise);
    if (step.levelChange === 'up') return steps;
    current = step.micro;
  }
  return null;
}
