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
import { bandStepsFor, parseBandRange, spendTier, tierCapFor, tierOf } from './tiers';

export { parseBandRange };

function rangeForExercise(exercise: Exercise): { low: number; high: number } {
  return exercise.metric === 'time'
    ? { low: PROGRESSION_TIME_LOW_SEC, high: PROGRESSION_TIME_HIGH_SEC }
    : { low: PROGRESSION_REP_LOW, high: PROGRESSION_REP_HIGH };
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

/**
 * The pace knobs — tempo +1s → rest −15s → sets +1 — climbed once the movement-specific knob is
 * exhausted. Shared by both equipment classes: a slower tempo and a shorter rest are harder with a
 * band in your hands too, and giving band exercises these tiers is what stops the top of a band
 * range being a dead end (see `tiers.ts`). The `BODYWEIGHT_*` constant names predate that and are
 * now read as "the cap", not "the bodyweight cap".
 */
function advancePace(micro: ProgressionMicroState): MicroStepResult {
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

/** One micro-progression step forward, per §6.2's order: reps → band+1 (reps reset, band
 *  exercises only) → tempo+1s → rest−15s → sets+1 → next level. */
export function microAdvance(micro: ProgressionMicroState, exercise: Exercise): MicroStepResult {
  const { high, low } = rangeForExercise(exercise);
  if (micro.repTarget < high) {
    return { micro: { ...micro, repTarget: micro.repTarget + 1 }, levelChange: null };
  }
  if (exercise.equipment === 'band') {
    const range = parseBandRange(exercise.band);
    const band = bandForExercise(micro, exercise);
    const maxBand = range?.[1] ?? band;
    if (band && maxBand && BAND_ORDER.indexOf(band) < BAND_ORDER.indexOf(maxBand)) {
      const nextBand = BAND_ORDER[BAND_ORDER.indexOf(band) + 1];
      return { micro: { ...micro, band: nextBand, repTarget: low }, levelChange: null };
    }
  }
  return advancePace(micro);
}

/** One micro-progression step backward — the exact reverse order of `microAdvance`. */
export function microRegress(micro: ProgressionMicroState, exercise: Exercise): MicroStepResult {
  const { low, high } = rangeForExercise(exercise);
  if (micro.sets > DEFAULT_SETS) {
    return { micro: { ...micro, sets: micro.sets - 1 }, levelChange: null };
  }
  if (micro.restSec < DEFAULT_REST_SEC) {
    return {
      micro: { ...micro, restSec: Math.min(DEFAULT_REST_SEC, micro.restSec + 15) },
      levelChange: null,
    };
  }
  if (micro.tempoSec > DEFAULT_TEMPO_SEC) {
    return { micro: { ...micro, tempoSec: micro.tempoSec - 1 }, levelChange: null };
  }
  if (exercise.equipment === 'band') {
    const range = parseBandRange(exercise.band);
    const band = bandForExercise(micro, exercise);
    const minBand = range?.[0] ?? band;
    if (band && minBand && BAND_ORDER.indexOf(band) > BAND_ORDER.indexOf(minBand)) {
      const prevBand = BAND_ORDER[BAND_ORDER.indexOf(band) - 1];
      return { micro: { ...micro, band: prevBand, repTarget: high }, levelChange: null };
    }
  }
  if (micro.repTarget > low) {
    return { micro: { ...micro, repTarget: micro.repTarget - 1 }, levelChange: null };
  }
  return { micro, levelChange: 'down' };
}

/**
 * §6.2 — pull the micro-state into line with the band the user actually trained with.
 *
 * The prescription says B2; the user picks up B3 because that is what is in the bag, or because B2
 * felt like nothing. Their next session should start from the band they *used*, not the one that
 * was suggested and ignored — otherwise the app re-prescribes B2 forever and the user re-corrects
 * it forever.
 *
 * The band the user held is a fact about `programmed`, but the state being repaired belongs to
 * `anchor`, and at a mixed-equipment level those have different knobs. So the correction is made
 * in *tiers*: work out how many band steps the observed band represents for the exercise actually
 * in their hands, compare with how many the current state was spending there, and move the stored
 * tier by the difference. A bodyweight anchor therefore records "you were a tier further along"
 * as a pace knob — which is exactly what `projectMicroToExercise` will turn back into a heavier
 * band next session. Previously this bailed out whenever the *anchor* was bodyweight, silently
 * discarding the correction at the 9 levels where it matters most.
 *
 * The rep target moves with the band exactly as it does when micro-progression itself changes
 * band (`microAdvance`/`microRegress`): heavier, back to the bottom of the range; lighter, up to
 * the top. Band and reps are one prescription, so adopting half of it would leave a pairing the
 * progression rules never produce.
 *
 * Clamped to the programmed exercise's own suggested range — the library, not the user's grab-bag,
 * decides what is a sane load for a movement (invariant 2), and a band outside it means "as
 * heavy/light as this exercise goes". No-ops for bodyweight work, for an unknown observed band,
 * and when the observed band is the prescribed one, which is the overwhelmingly common case.
 */
export function reconcileMicroToObservedBand(
  micro: ProgressionMicroState,
  anchor: Exercise,
  programmed: Exercise,
  observedBand: BandId | null | undefined,
): ProgressionMicroState {
  if (programmed.equipment !== 'band' || !observedBand) return micro;
  const range = parseBandRange(programmed.band);
  if (!range) return micro;

  const [lo, hi] = range;
  const steps = bandStepsFor(programmed);
  const clamped = Math.min(
    Math.max(BAND_ORDER.indexOf(observedBand), BAND_ORDER.indexOf(lo)),
    BAND_ORDER.indexOf(hi),
  );
  const observedBandTier = clamped - BAND_ORDER.indexOf(lo);

  const currentTier = tierOf(micro, anchor);
  // Only the part of the current tier that this exercise was spending on band size is comparable;
  // the rest is pace knobs, which the observed band says nothing about and must not be reset.
  const currentBandTier = Math.min(currentTier, steps);
  if (observedBandTier === currentBandTier) {
    // Same position — nothing to correct. A null band against a band anchor is still written back
    // to the band it resolves to, so state stored before an anchor was re-pointed converges on
    // what the user was being prescribed all along (see `bandForExercise`).
    if (!micro.band && anchor.equipment === 'band' && parseBandRange(anchor.band)) {
      return { ...micro, band: spendTier(currentTier, anchor).band };
    }
    return micro;
  }

  const nextTier = Math.min(
    Math.max(currentTier + (observedBandTier - currentBandTier), 0),
    tierCapFor(anchor),
  );
  const { low, high } = rangeForExercise(anchor);
  const heavier = observedBandTier > currentBandTier;
  return {
    ...micro,
    ...spendTier(nextTier, anchor),
    repTarget: heavier ? low : high,
  };
}

/** True once every micro knob is at its floor for this level (used to detect the "two
 *  consecutive regressions at the bottom micro-step" drop-a-level trigger, §6.3). */
export function isAtBottomMicroStep(micro: ProgressionMicroState, exercise: Exercise): boolean {
  const { low } = rangeForExercise(exercise);
  if (
    micro.repTarget > low ||
    micro.tempoSec > DEFAULT_TEMPO_SEC ||
    micro.restSec < DEFAULT_REST_SEC ||
    micro.sets > DEFAULT_SETS
  ) {
    return false;
  }
  // The pace knobs are at their floor either way; a band exercise additionally has to be back on
  // the lightest band it is authored for before there is nothing left to give back.
  if (exercise.equipment === 'band') {
    const band = bandForExercise(micro, exercise);
    const range = parseBandRange(exercise.band);
    const minBand = range?.[0] ?? band;
    return !band || !minBand || band === minBand;
  }
  return true;
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
