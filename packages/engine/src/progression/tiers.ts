/**
 * §6.2 micro-progression, expressed as an *abstract tier* rather than a concrete prescription.
 *
 * A level's siblings (ADR 0010) are interchangeable as movements but NOT as ladders: a band
 * exercise progresses by band size, a bodyweight one by tempo/rest/sets. `ProgressionState.micro`
 * is a single stored prescription tracked against the level's *anchor*, so at a mixed-equipment
 * level (16 of 61 today) it was being read against an exercise with different knobs entirely.
 * That produced two bugs, in opposite directions:
 *
 * - Anchor bodyweight, sibling band: `micro.band` stays null, the prescription pins to the
 *   sibling's lightest authored band, and the top of its range is unreachable. Banded Standing
 *   Chest Press is authored B2-B3 and could never be prescribed B3.
 * - Anchor band, sibling bodyweight: the band step advances in state where nothing can show it,
 *   and its rep reset lands on the bodyweight sibling as reps 12 -> 8 with no other change — an
 *   unexplained demotion (invariant 4).
 *
 * The fix is to stop treating the stored knobs as the ladder. The ladder is one ordered list of
 * ways to make a level harder — band size first where there is any, then tempo, rest, sets — and
 * a *tier* is a position in it. Each exercise spends a tier on whichever knob it actually has, so
 * the same position projects onto a band sibling as a heavier band and onto a bodyweight sibling
 * as a slower tempo. Nothing freezes and nothing moves invisibly.
 *
 * Tier count comes from the level's anchor, so level length stays stable and the §14.1.4
 * dashboard's "N sessions to next level" cannot disagree with what the ladder actually does.
 * Only how a tier is *spent* varies by sibling.
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
} from './constants';

/** Tiers every exercise has regardless of equipment, spent after band headroom runs out:
 *  tempo +1s, rest -15s, sets +1. One increment each, per §6.2's linear wording. */
const PACE_TIERS = 3;

/** Parses a suggested band range like "B1-B3" into [min, max]. Single band ("B2") returns
 *  [B2, B2]. `null` (bodyweight) returns null. Lives here rather than in `micro.ts` so that the
 *  tier math this file owns stays the lower layer and the import direction has no cycle. */
export function parseBandRange(band: string | null): [BandId, BandId] | null {
  if (!band) return null;
  const parts = band.split('-');
  const lo = parts[0] as BandId;
  const hi = (parts[1] ?? parts[0]) as BandId;
  return [lo, hi];
}

/** How many band steps this exercise's authored range affords — 0 for bodyweight, and 0 for a
 *  single-band record like Banded Frog Pump ("B2"), which has a band but no room to climb. */
export function bandStepsFor(exercise: Exercise): number {
  if (exercise.equipment !== 'band') return 0;
  const range = parseBandRange(exercise.band);
  if (!range) return 0;
  const steps = BAND_ORDER.indexOf(range[1]) - BAND_ORDER.indexOf(range[0]);
  return steps > 0 ? steps : 0;
}

/**
 * The highest tier this exercise can express — its band headroom plus the three pace tiers.
 *
 * Taking the pace tiers for band exercises too is what makes the top of a band range stop being a
 * dead end: a maxed band still has a slower tempo, a shorter rest and an extra set to climb before
 * the level is done. It lengthens a band-anchored level (B2-B3 goes from 10 qualifying sessions to
 * 13) and leaves a bodyweight-anchored one unchanged at 8.
 */
export function tierCapFor(exercise: Exercise): number {
  return bandStepsFor(exercise) + PACE_TIERS;
}

/**
 * Read a stored micro-state as a tier, against the exercise it was tracked for (the anchor).
 *
 * The inverse of `spendTier`, and lossy by design: it recovers the ladder position, not the exact
 * knob values, which is all the projection needs. `micro.band` can legitimately be null against a
 * band anchor (see `bandForExercise` in micro.ts), in which case the band contributes no tier.
 */
export function tierOf(micro: ProgressionMicroState, exercise: Exercise): number {
  let tier = 0;
  if (exercise.equipment === 'band' && micro.band) {
    const range = parseBandRange(exercise.band);
    if (range) {
      const offset = BAND_ORDER.indexOf(micro.band) - BAND_ORDER.indexOf(range[0]);
      if (offset > 0) tier += offset;
    }
  }
  if (micro.tempoSec > DEFAULT_TEMPO_SEC) tier += 1;
  if (micro.restSec < DEFAULT_REST_SEC) tier += 1;
  if (micro.sets > DEFAULT_SETS) tier += 1;
  return tier;
}

export interface TierKnobs {
  band: BandId | null;
  tempoSec: number;
  restSec: number;
  sets: number;
}

/**
 * Spend `tier` on one exercise's own knobs, band headroom first and then tempo -> rest -> sets.
 * A tier past what this exercise can express saturates rather than wrapping — that happens when a
 * band-anchored level (cap = steps + 3) hands its top tier to a bodyweight sibling (cap = 3).
 */
export function spendTier(tier: number, exercise: Exercise): TierKnobs {
  let remaining = Math.max(0, tier);

  let band: BandId | null = null;
  if (exercise.equipment === 'band') {
    const range = parseBandRange(exercise.band);
    if (range) {
      const used = Math.min(remaining, bandStepsFor(exercise));
      band = BAND_ORDER[BAND_ORDER.indexOf(range[0]) + used];
      remaining -= used;
    }
  }

  const tempoSec = remaining > 0 ? BODYWEIGHT_TEMPO_CAP_SEC : DEFAULT_TEMPO_SEC;
  if (remaining > 0) remaining -= 1;
  const restSec = remaining > 0 ? BODYWEIGHT_REST_FLOOR_SEC : DEFAULT_REST_SEC;
  if (remaining > 0) remaining -= 1;
  const sets = remaining > 0 ? BODYWEIGHT_SETS_CAP : DEFAULT_SETS;

  return { band, tempoSec, restSec, sets };
}

/**
 * The prescription for `programmed`, given a micro-state tracked against `anchor`. The one place
 * a level's stored ladder position is adapted to the sibling actually drawn this session.
 *
 * `repTarget` passes straight through: it is the one knob both equipment classes share, and it is
 * what the user is being asked to hit today whichever sibling is in front of them.
 */
export function projectMicroToExercise(
  micro: ProgressionMicroState,
  anchor: Exercise,
  programmed: Exercise,
): ProgressionMicroState {
  const knobs = spendTier(tierOf(micro, anchor), programmed);
  return { repTarget: micro.repTarget, ...knobs };
}
