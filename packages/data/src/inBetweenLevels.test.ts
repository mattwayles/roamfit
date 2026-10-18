/**
 * Track 37k — in-between ladder levels. New rungs have new stable level_ids placed between their
 * neighbours (never a renumbering, invariant 5); the squat and lunge ladders now start on a
 * supported version a true beginner can do.
 */
import { exerciseLibrary, familyLibrary } from './index';

const ids = (familyId: string) =>
  familyLibrary.families.find((f) => f.id === familyId)!.levels.map((l) => l.level_id);
const byId = new Map(exerciseLibrary.exercises.map((e) => [e.id, e]));

describe('in-between levels (track 37k)', () => {
  it.each([
    ['squat', 'squat.l0', null, 'squat.l1'],
    ['squat', 'squat.l6b', 'squat.l6', 'squat.l7'],
    ['lunge', 'lunge.l0', null, 'lunge.l1'],
    ['horizontal_push', 'horizontal_push.l3b', 'horizontal_push.l3', 'horizontal_push.l4'],
    ['horizontal_push', 'horizontal_push.l8b', 'horizontal_push.l8', 'horizontal_push.l9'],
    ['vertical_pull', 'vertical_pull.l6b', 'vertical_pull.l6', 'vertical_pull.l7'],
    ['vertical_push', 'vertical_push.l6b', 'vertical_push.l6', 'vertical_push.l7'],
    ['hinge', 'hinge.l6b', 'hinge.l6', 'hinge.l7'],
  ])('%s: %s sits between %s and %s', (family, inserted, below, above) => {
    const order = ids(family);
    const at = order.indexOf(inserted);
    expect(at).toBeGreaterThanOrEqual(0);
    if (below) expect(order[at - 1]).toBe(below);
    else expect(at).toBe(0);
    expect(order[at + 1]).toBe(above);
  });

  it('the squat and lunge ladders start on a supported, easy, equipment-free movement', () => {
    for (const family of ['squat', 'lunge']) {
      const first = familyLibrary.families.find((f) => f.id === family)!.levels[0];
      const ex = byId.get(first.anchor_exercise_id)!;
      expect(ex.difficulty).toBe('easy');
      expect(ex.anchor).toBe('none');
    }
  });

  it('every rung that had a single exercise on the high end now has a sibling', () => {
    for (const levelId of [
      'horizontal_push.l7',
      'horizontal_pull.l4',
      'horizontal_pull.l5',
      'horizontal_pull.l6',
      'horizontal_pull.l7',
      'horizontal_pull.l8',
      'anti_extension.l4',
      'anti_extension.l6',
    ]) {
      const level = familyLibrary.families
        .flatMap((f) => f.levels)
        .find((l) => l.level_id === levelId)!;
      expect(level.exercise_ids.length).toBeGreaterThan(1);
    }
  });
});
