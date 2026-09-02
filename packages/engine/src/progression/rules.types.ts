import type { ProgressionFamilyId } from '@roamfit/data';
import type { BandId, DifficultyFeedback } from '../types';

/**
 * What the caller (Wave 3, at session completion) reports back about one family's working sets
 * this session. Shared between calibration.ts and rules.ts to avoid a circular import.
 */
export interface SessionPerformance {
  familyId: ProgressionFamilyId;
  /** Every working set completed at or above the top of the prescribed range/hold target. */
  allSetsAtOrAboveTop: boolean;
  /** At least one working set finished below the bottom of the prescribed range/hold target. */
  missedBottom: boolean;
  difficultyFeedback: DifficultyFeedback;
  /** §6.5 calibration only — how far actual reps/seconds exceeded the target, e.g. 0.3 for 30%
   *  over. Undefined/0 when not applicable. */
  exceededTargetByRatio?: number;
  /** The band the user recorded actually using for this family's working sets, when they told us
   *  (per-set, on the workout screen) and it differs from what was prescribed. Undefined/null means
   *  "no correction reported" — bodyweight work, or the ordinary case where the prescription was
   *  simply followed. See `reconcileMicroToObservedBand`. */
  observedBand?: BandId | null;
}
