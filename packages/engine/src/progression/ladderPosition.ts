/**
 * Where on a progression family's ladder a past session was PERFORMED — the number behind the
 * "Progress" chart.
 *
 * A reps-only chart reads "band up, reps reset to 8" as a decline. The engine's own micro ladder
 * (`microAdvance`) treats it as a step forward: reps -> band (reps reset) -> tempo -> rest -> sets
 * -> next rung. So the honest y-value is *how many micro-steps up that ladder* the session got:
 *
 *   position = (sum of the step-lengths of every rung below the session's rung)
 *            + (micro-steps from this rung's floor to the performed state)
 *
 * Everything is measured against the level's ANCHOR exercise, exactly as progression itself is
 * (`currentExercise` in rules.ts). That mirrors the known "frozen band at a bodyweight-anchored
 * rung" behaviour rather than fixing it: a band sibling at a bodyweight-anchored rung earns credit
 * through reps/tempo/rest/sets only, and its band is ignored (the anchor's ladder has no band).
 *
 * "Performed state reaches a ladder step": walk `microAdvance` from `defaultMicroForExercise`.
 * Both the walked state and the performed state are ordered lexicographically with the knob that
 * the ladder moves LAST as most significant: sets, then rest (shorter is further), then tempo,
 * then band, then reps. A walked state is credited iff it is <= the performed state in that order;
 * the in-rung step count is the number of advances whose result is still credited. Consequences:
 *   - below the floor of any knob counts as that knob's floor (a skipped set, a longer rest, a
 *     faster tempo never subtract; the session is not placed below the rung floor) — invariant 4;
 *   - above the cap of a knob is clamped to the cap (reps above the range, a band heavier than the
 *     anchor's authored top, tempo/sets past the cap) — the ladder never credits more than it
 *     would itself grant;
 *   - a state off the ladder's path (e.g. tempo +1 on a lighter band than the ladder would have
 *     reached) is credited up to the last fully-reached step before it;
 *   - credit never crosses a rung boundary: the level-up step belongs to the next rung's floor.
 *
 * Level ids are compared, never indices (invariant 5). The top (mastery) rung has no "next level",
 * so its in-rung walk simply runs until the ladder itself says level-up, and nothing is added
 * above it. Pure: no I/O.
 */
import type { Exercise, ProgressionFamily } from '@roamfit/data';
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
import { levelOrdinal } from './ladder';
import { defaultMicroForExercise, microAdvance, microStepsToNextLevel } from './micro';
import { parseBandRange } from './tiers';

/** What a session actually did with one laddered exercise (the store's per-session fold). */
export interface PerformedSession {
  /** Best completed set in reps; null when none was logged in reps. */
  bestReps: number | null;
  /** Best completed set in seconds; null when none was logged in seconds. */
  bestSeconds: number | null;
  /** Heaviest band actually used; null for bodyweight work. */
  band: BandId | null;
  tempoSec: number;
  restSec: number;
  setsCompleted: number;
}

export interface LadderPosition {
  /** Cumulative micro-steps from the bottom of the family's first rung. The chart's y-value. */
  position: number;
  /** The rung's stable id (echoed back; the 1-based ordinal below is for display only). */
  levelId: string;
  /** 1-based "Rung N" for display. */
  rung: number;
  /** Micro-steps from this rung's floor to the performed state. */
  stepsInRung: number;
  /** Steps in this rung before the next rung's floor; null on the mastery rung (open-ended). */
  rungLength: number | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** The performed value on the anchor's own unit; null when the session has nothing on it. */
function performedValue(anchor: Exercise, p: PerformedSession): number | null {
  return anchor.metric === 'time' ? p.bestSeconds : p.bestReps;
}

/** Sort key, most significant first: sets, rest-progress, tempo, band, reps. */
function key(micro: ProgressionMicroState): number[] {
  return [
    micro.sets,
    -micro.restSec,
    micro.tempoSec,
    micro.band ? BAND_ORDER.indexOf(micro.band) : -1,
    micro.repTarget,
  ];
}

function atMost(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return true;
}

/** The performed session expressed as a ladder state for `anchor`, clamped into its grid. */
function performedState(
  anchor: Exercise,
  floor: ProgressionMicroState,
  p: PerformedSession,
  value: number,
): ProgressionMicroState {
  const [repLow, repHigh] =
    anchor.metric === 'time'
      ? [PROGRESSION_TIME_LOW_SEC, PROGRESSION_TIME_HIGH_SEC]
      : [PROGRESSION_REP_LOW, PROGRESSION_REP_HIGH];
  let band: BandId | null = null;
  if (floor.band) {
    const range = parseBandRange(anchor.band);
    const lo = BAND_ORDER.indexOf(range?.[0] ?? floor.band);
    const hi = BAND_ORDER.indexOf(range?.[1] ?? floor.band);
    const idx = p.band ? BAND_ORDER.indexOf(p.band) : lo;
    band = BAND_ORDER[clamp(idx, lo, hi)];
  }
  return {
    repTarget: clamp(value, repLow, repHigh),
    band,
    tempoSec: clamp(p.tempoSec, DEFAULT_TEMPO_SEC, BODYWEIGHT_TEMPO_CAP_SEC),
    restSec: clamp(p.restSec, BODYWEIGHT_REST_FLOOR_SEC, DEFAULT_REST_SEC),
    sets: clamp(p.setsCompleted, DEFAULT_SETS, BODYWEIGHT_SETS_CAP),
  };
}

/** Micro-steps from the rung's floor that the performed state has fully reached. */
export function stepsReached(anchor: Exercise, performed: ProgressionMicroState): number {
  const target = key(performed);
  let micro = defaultMicroForExercise(anchor);
  let steps = 0;
  // Bounded by the ladder itself (it reports level-up well inside this); belt and braces only.
  for (let i = 0; i < 100; i += 1) {
    const next = microAdvance(micro, anchor);
    if (next.levelChange) break;
    if (!atMost(key(next.micro), target)) break;
    micro = next.micro;
    steps += 1;
  }
  return steps;
}

/**
 * Place one session on the family's ladder. Returns `null` — the session cannot be placed, and
 * the chart leaves a gap rather than inventing a position — when the level id is unknown or null,
 * the level's anchor is missing from `library`, or the session has no measured set in the anchor's
 * unit.
 */
export function ladderPosition(
  family: ProgressionFamily,
  levelId: string | null,
  performed: PerformedSession,
  library: readonly Exercise[],
): LadderPosition | null {
  if (!levelId) return null;
  const level = family.levels.find((l) => l.level_id === levelId);
  if (!level) return null;
  const byId = new Map(library.map((e) => [e.id, e]));
  const anchor = byId.get(level.anchor_exercise_id);
  if (!anchor) return null;
  const value = performedValue(anchor, performed);
  if (value === null) return null;

  // Every rung below this one contributes its whole step-length.
  let below = 0;
  for (const lower of family.levels) {
    if (lower.level_id === levelId) break;
    const lowerAnchor = byId.get(lower.anchor_exercise_id);
    if (!lowerAnchor) return null;
    const len = microStepsToNextLevel(defaultMicroForExercise(lowerAnchor), lowerAnchor);
    if (len === null) return null;
    below += len;
  }

  const floor = defaultMicroForExercise(anchor);
  const stepsInRung = stepsReached(anchor, performedState(anchor, floor, performed, value));
  return {
    position: below + stepsInRung,
    levelId,
    rung: levelOrdinal(family, levelId).n,
    stepsInRung,
    rungLength: microStepsToNextLevel(floor, anchor),
  };
}
