/**
 * What one rep of an exercise counts, for the cue beside a rep count. A unilateral exercise is
 * done a side at a time, so its reps are per side. An alternating one (bicycle crunch, flutter
 * kick) takes both sides inside one set, and its reps are the total across both. Everything
 * else needs no cue. Timed holds are not covered: they already show "Side 1 of 2".
 */
import type { Exercise } from '@roamfit/data';

export function repBasis(
  exercise: Pick<Exercise, 'unilateral' | 'alternating' | 'metric'> | undefined | null,
): string | null {
  if (!exercise || exercise.metric !== 'reps') return null;
  if (exercise.unilateral) return 'per side';
  if (exercise.alternating) return 'total, both sides';
  return null;
}
