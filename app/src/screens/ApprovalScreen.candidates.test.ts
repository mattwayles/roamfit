/**
 * Track 14 — §10.3 "Add exercise" must scope its MAIN-section candidates by focus the same way
 * the generation pipeline scopes its own MAIN pool (`pipeline.ts`'s `mainPool`): a cardio session
 * only offers conditioning exercises, and every other focus never offers one. Without this, a
 * hand-added burpee could land in a Legs session's main work, or a squat could land in a Cardio
 * one — exactly the leak the engine's own pool-scoping (Track 14 increment 3) was built to close
 * for generation, that "Add exercise" bypasses by construction unless it re-applies the same rule.
 *
 * Warmup/cooldown are deliberately excluded from the scoping (see the function's doc comment) —
 * a cardio move may still open a strength day and a strength stretch may still close a cardio
 * day, matching the pipeline's own unscoped warmup/cooldown pools.
 */
import { scopeMainCandidatesToFocus } from './ApprovalScreen';
import type { Exercise } from '@roamfit/data';

function exercise(id: string, pattern: string): Exercise {
  return { id, pattern } as unknown as Exercise;
}

const conditioning = exercise('bw-burpee', 'conditioning');
const squat = exercise('bw-squat', 'squat');
const hinge = exercise('bw-deadlift', 'hinge');

describe('scopeMainCandidatesToFocus', () => {
  it('a cardio MAIN request keeps only conditioning exercises', () => {
    const result = scopeMainCandidatesToFocus([conditioning, squat, hinge], 'cardio', 'main');
    expect(result).toEqual([conditioning]);
  });

  it('a non-cardio MAIN request excludes every conditioning exercise', () => {
    for (const focus of ['upper', 'abs', 'legs', 'full'] as const) {
      const result = scopeMainCandidatesToFocus([conditioning, squat, hinge], focus, 'main');
      expect(result).toEqual([squat, hinge]);
    }
  });

  it('is a no-op for warmup — a cardio move may still open a strength day', () => {
    const result = scopeMainCandidatesToFocus([conditioning, squat], 'legs', 'warmup');
    expect(result).toEqual([conditioning, squat]);
  });

  it('is a no-op for cooldown — a strength stretch may still close a cardio day', () => {
    const result = scopeMainCandidatesToFocus([conditioning, squat], 'cardio', 'cooldown');
    expect(result).toEqual([conditioning, squat]);
  });
});
