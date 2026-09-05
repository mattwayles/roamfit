import type { ProgressionFamilyId } from '@roamfit/data';
import type { BandId, DifficultyFeedback } from '../types';

/**
 * What the caller (Wave 3, at session completion) reports back about one family's working sets
 * this session. Shared between calibration.ts and rules.ts to avoid a circular import.
 */
export interface SessionPerformance {
  familyId: ProgressionFamilyId;
  /**
   * Every working set met the prescribed reps/hold — the sole thing that earns an advance.
   *
   * The yardstick is the prescription itself, never the top of the rep range: a level is entered
   * at the bottom of the range and climbs a rep at a time, so "met what I was asked for" is what
   * moves the ladder. Doing *more* than prescribed earns nothing extra — there is no overshoot
   * bonus anywhere in this file's consumers, by design.
   */
  allSetsMetTarget: boolean;
  /** At least one working set finished below the prescribed reps/hold. */
  anySetBelowTarget: boolean;
  difficultyFeedback: DifficultyFeedback;
  /** The band the user recorded actually using for this family's working sets, when they told us
   *  (per-set, on the workout screen) and it differs from what was prescribed. Undefined/null means
   *  "no correction reported" — bodyweight work, or the ordinary case where the prescription was
   *  simply followed. See `reconcileMicroToObservedBand`. */
  observedBand?: BandId | null;
}
