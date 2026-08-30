import type { ProgressionFamilyId } from '@roamfit/data';
import type { DifficultyFeedback } from '../types';

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
}
