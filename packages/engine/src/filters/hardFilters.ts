/**
 * §5.1 step 1 — HARD FILTERS. Never negotiable, and run first, before anything else (selection,
 * enjoyment, novelty) sees the pool. Invariant 3: safety filters live in code.
 *
 * Three filters, all §13.2-style "removed outright, never a prompt hint":
 *  - equipment: caller's `equipmentPreference`, when not `any`.
 *  - anchors: exercise.anchor must be in the user's sticky `anchorsAvailable` list (§5.3). This
 *    is also where the §13.1 bodyweight-bearing gate lives — those anchors are simply absent
 *    from the list unless the user explicitly enabled them, so nothing bodyweight-bearing is
 *    ever eligible until enabled.
 *  - injuries: any exercise whose `contraindications[]` intersects the user's active
 *    `limitations[]` tags is removed outright (§13.2).
 */
import type { Anchor, Exercise } from '@roamfit/data';
import { daysBetween } from '../dates';
import type { EquipmentPreference, GenerationRequest, LocalDate, Limitation } from '../types';

/** §5.3 defaults: all band-tension anchors on, all bodyweight-bearing anchors off — with one
 *  documented exception, `low-bar` (ADR 0007, carried-forward issue #2). A waist-height bar is
 *  near-universally available, and an inverted row is partial-support rather than a full dynamic
 *  hang, so it is on by default. It remains `bodyweight_bearing`, so `effortCapForExercise` still
 *  caps it at `normal` — availability was relaxed, the §13.1 safety cap was not.
 *  Callers (app/settings layer) own the persisted list; this is a convenience for tests and cold
 *  start. */
export const DEFAULT_ANCHORS_AVAILABLE: readonly Anchor[] = [
  'none',
  'stance',
  'feet',
  'self-low',
  'thigh-loop',
  'anchor-low',
  'anchor-mid',
  'anchor-high',
  'low-bar',
];

function isEquipmentEligible(exercise: Exercise, pref: EquipmentPreference | undefined): boolean {
  if (!pref || pref === 'any') return true;
  return exercise.equipment === pref;
}

function isAnchorEligible(exercise: Exercise, anchorsAvailable: readonly Anchor[]): boolean {
  return anchorsAvailable.includes(exercise.anchor);
}

/** An active limitation: no `expiresAt`, or `expiresAt` is still in the future relative to `today`. */
function isLimitationActive(l: Limitation, today: LocalDate): boolean {
  if (!l.expiresAt) return true;
  return daysBetween(today, l.expiresAt) >= 0;
}

function isInjuryEligible(
  exercise: Exercise,
  limitations: readonly Limitation[],
  today: LocalDate,
): boolean {
  const activeTags = new Set(
    limitations.filter((l) => isLimitationActive(l, today)).map((l) => l.tag),
  );
  if (activeTags.size === 0) return true;
  return !exercise.contraindications.some((c) => activeTags.has(c));
}

export interface HardFilterInput {
  library: readonly Exercise[];
  request: Pick<GenerationRequest, 'equipmentPreference'>;
  anchorsAvailable: readonly Anchor[];
  limitations: readonly Limitation[];
  today: LocalDate;
}

/** Returns the subset of the library that survives all three hard filters. */
export function applyHardFilters(input: HardFilterInput): Exercise[] {
  return input.library.filter(
    (e) =>
      isEquipmentEligible(e, input.request.equipmentPreference) &&
      isAnchorEligible(e, input.anchorsAvailable) &&
      isInjuryEligible(e, input.limitations, input.today),
  );
}

/**
 * §13.1 — regardless of the day's chosen effort, any exercise with `anchor_class:
 * bodyweight_bearing` is hard-capped at `normal` (2+ reps in reserve, no AMRAP). This is a code
 * filter on the effort actually prescribed to that exercise, not a suggestion. `hard` and `easy`
 * both pass through unaffected for other anchor classes; only `hard` is ever capped down.
 */
export function effortCapForExercise(
  exercise: Exercise,
  requestedEffort: 'easy' | 'normal' | 'hard',
): 'easy' | 'normal' | 'hard' {
  if (exercise.anchor_class === 'bodyweight_bearing' && requestedEffort === 'hard') {
    return 'normal';
  }
  return requestedEffort;
}
