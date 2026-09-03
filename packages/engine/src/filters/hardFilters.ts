/**
 * §5.1 step 1 — HARD FILTERS. Never negotiable, and run first, before anything else (selection,
 * enjoyment, novelty) sees the pool. Invariant 3: safety filters live in code.
 *
 * Four filters, all §13.2-style "removed outright, never a prompt hint":
 *  - equipment: caller's `equipmentPreference`, when not `any`.
 *  - anchors: bodyweight exercises and band exercises that need no fixed point
 *    (`ALWAYS_AVAILABLE_ANCHORS`) are always eligible — there is nothing for the user to lack.
 *    Everything else must have its `exercise.anchor` in the user's sticky `anchorsAvailable`
 *    list (§5.3): band exercises that anchor to a low/mid/high point, and bodyweight-bearing
 *    exercises needing a bar or bench. This is also where the §13.1 bodyweight-bearing gate
 *    lives — those anchors are simply absent from the list unless the user explicitly enabled
 *    them, so nothing bodyweight-bearing is ever eligible until enabled.
 *  - injuries: any exercise whose `contraindications[]` intersects the user's active
 *    `limitations[]` tags is removed outright (§13.2).
 *  - disabled: any exercise the user has explicitly disabled from the Exercises detail screen
 *    or the workout approval screen. Permanent until re-enabled — distinct from
 *    `ExerciseState.suppressedUntil`'s temporary, system-managed cooldown.
 *
 * Difficulty eligibility (`isDifficultyEligible`, below) is a separate, narrower-scoped filter
 * applied only where the requested difficulty should actually gate exercise choice —
 * `mainSelection.ts`'s accessory pool, and `resolveSlot.ts`'s already-mastered-lower-rung pool.
 * It is deliberately not folded into `applyHardFilters` itself: the current progression rung
 * (the exercise the user's ladder state actually points at) stays reachable regardless of the
 * day's requested difficulty, so progressive overload isn't interrupted by picking "easy" on an
 * off day, and mid-workout swap keeps ranking by closeness to the replaced exercise's own
 * difficulty (`swap.ts`) rather than by the session's original request.
 */
import type { Anchor, Difficulty, Exercise } from '@roamfit/data';
import { daysBetween } from '../dates';
import type { EquipmentPreference, GenerationRequest, LocalDate, Limitation } from '../types';

/** Bodyweight exercises (`anchor: 'none'`) and band exercises that tension against the user's
 *  own body rather than a fixed point (`stance`, `feet`, `self-low`, `thigh-loop`) need nothing
 *  the user could lack, so they are never gated by `anchorsAvailable` — see `isAnchorEligible`.
 *  Not user-configurable and not part of the "Available Equipment" picker. */
export const ALWAYS_AVAILABLE_ANCHORS: readonly Anchor[] = [
  'none',
  'stance',
  'feet',
  'self-low',
  'thigh-loop',
];

/** §5.3 defaults for the anchors that *do* need to be picked — band exercises anchored to a
 *  low/mid/high point, plus bar/bench equipment. Every option the "Available Equipment" picker
 *  (`GenerateScreen`) offers is checked by default — a new user should see the full library, not
 *  a pre-narrowed one — and each toggle persists back through `usersRepo`, so what the user
 *  actually has stays remembered rather than re-defaulting on every visit. This does not weaken
 *  §13.1: `pullup-bar` and `body-support` stay `bodyweight_bearing`, so `difficultyCapForExercise`
 *  still caps them at `medium` regardless of whether the user has them enabled. Callers
 *  (app/settings layer) own the persisted list; this is a convenience for tests and cold start. */
export const DEFAULT_ANCHORS_AVAILABLE: readonly Anchor[] = [
  'anchor-low',
  'anchor-mid',
  'anchor-high',
  'low-bar',
  'pullup-bar',
  'body-support',
];

function isEquipmentEligible(exercise: Exercise, pref: EquipmentPreference | undefined): boolean {
  if (!pref || pref === 'any') return true;
  return exercise.equipment === pref;
}

function isAnyAnchorEligible(anchor: Anchor, anchorsAvailable: readonly Anchor[]): boolean {
  if (ALWAYS_AVAILABLE_ANCHORS.includes(anchor)) return true;
  return anchorsAvailable.includes(anchor);
}

/** `anchor_alt`, when set, is a genuine alternative (§5.3) — the user needs `anchor` OR
 *  `anchor_alt`, not both, so eligibility passes if either one is available. */
function isAnchorEligible(exercise: Exercise, anchorsAvailable: readonly Anchor[]): boolean {
  if (isAnyAnchorEligible(exercise.anchor, anchorsAvailable)) return true;
  return exercise.anchor_alt !== null && isAnyAnchorEligible(exercise.anchor_alt, anchorsAvailable);
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

function isUserEnabled(exercise: Exercise, disabledExerciseIds: ReadonlySet<string>): boolean {
  return !disabledExerciseIds.has(exercise.id);
}

/**
 * The user-selected session difficulty determines which exercises are eligible by their own
 * library `difficulty` tag:
 *  - `easy` request: `easy` exercises only.
 *  - `medium` request: `easy` + `medium` eligible (medium preferred — see `mainSelection.ts`'s
 *    scoring bonus).
 *  - `hard` request: `medium` + `hard` eligible (hard preferred).
 * There is deliberately no path from `easy` to `hard` or back — each request only reaches one
 * neighboring tier, not the whole scale.
 */
export function isDifficultyEligible(exercise: Exercise, requested: Difficulty): boolean {
  switch (requested) {
    case 'easy':
      return exercise.difficulty === 'easy';
    case 'medium':
      return exercise.difficulty === 'easy' || exercise.difficulty === 'medium';
    case 'hard':
      return exercise.difficulty === 'medium' || exercise.difficulty === 'hard';
  }
}

export interface HardFilterInput {
  library: readonly Exercise[];
  request: Pick<GenerationRequest, 'equipmentPreference'>;
  anchorsAvailable: readonly Anchor[];
  limitations: readonly Limitation[];
  disabledExerciseIds: ReadonlySet<string>;
  today: LocalDate;
}

/** Returns the subset of the library that survives all four hard filters. */
export function applyHardFilters(input: HardFilterInput): Exercise[] {
  return input.library.filter(
    (e) =>
      isEquipmentEligible(e, input.request.equipmentPreference) &&
      isAnchorEligible(e, input.anchorsAvailable) &&
      isInjuryEligible(e, input.limitations, input.today) &&
      isUserEnabled(e, input.disabledExerciseIds),
  );
}

/**
 * §13.1 — regardless of the day's chosen difficulty, any exercise with `anchor_class:
 * bodyweight_bearing` is hard-capped at `medium` (2+ reps in reserve, no AMRAP). This is a code
 * filter on the difficulty actually prescribed to that exercise, not a suggestion. `hard` and
 * `easy` both pass through unaffected for other anchor classes; only `hard` is ever capped down.
 */
export function difficultyCapForExercise(
  exercise: Exercise,
  requestedDifficulty: Difficulty,
): Difficulty {
  if (exercise.anchor_class === 'bodyweight_bearing' && requestedDifficulty === 'hard') {
    return 'medium';
  }
  return requestedDifficulty;
}
