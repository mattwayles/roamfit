import { familyLibrary, exerciseLibrary } from '@roamfit/data';
import {
  calibrationStartLevel,
  exerciseForLevel,
  findFamily,
  isMaxLevel,
  isMinLevel,
  levelOrdinal,
  nextLevel,
  prevLevel,
} from './ladder';

const families = familyLibrary.families;
const library = exerciseLibrary.exercises;
const horizontalPush = findFamily(families, 'horizontal_push')!;

describe('§6.1/§4.2 ladder lookups (stable level_id, never a positional index)', () => {
  it('finds a family by id', () => {
    expect(horizontalPush).toBeDefined();
    expect(horizontalPush.levels.length).toBe(9);
  });

  it('resolves the exercise for a level_id', () => {
    const ex = exerciseForLevel(horizontalPush, 'horizontal_push.l1', library);
    expect(ex?.id).toBe('bw-wall-push-up');
  });

  it('isMinLevel/isMaxLevel are correct at both ends and false in the middle', () => {
    expect(isMinLevel(horizontalPush, 'horizontal_push.l1')).toBe(true);
    expect(isMaxLevel(horizontalPush, 'horizontal_push.l9')).toBe(true);
    expect(isMinLevel(horizontalPush, 'horizontal_push.l5')).toBe(false);
    expect(isMaxLevel(horizontalPush, 'horizontal_push.l5')).toBe(false);
  });

  it('nextLevel/prevLevel walk by id, and are undefined past either end', () => {
    expect(nextLevel(horizontalPush, 'horizontal_push.l1')?.level_id).toBe('horizontal_push.l2');
    expect(prevLevel(horizontalPush, 'horizontal_push.l1')).toBeUndefined();
    expect(nextLevel(horizontalPush, 'horizontal_push.l9')).toBeUndefined();
    expect(prevLevel(horizontalPush, 'horizontal_push.l9')?.level_id).toBe('horizontal_push.l8');
  });

  it('levelOrdinal is 1-based "Level N of M" for display only', () => {
    expect(levelOrdinal(horizontalPush, 'horizontal_push.l5')).toEqual({ n: 5, of: 9 });
  });

  it('cold start places every family at level 1 (ADR 0012)', () => {
    // §6.5 started users at ~the 30th percentile, i.e. horizontal_push.l3 (knee push-ups) for a
    // 9-rung ladder. ADR 0012 starts at the bottom instead: a ladder you are placed partway up by
    // guesswork is not a ladder. `levelUpForTooEasy` is the escape hatch for anyone already past
    // the lower rungs.
    expect(calibrationStartLevel(horizontalPush).level_id).toBe('horizontal_push.l1');
    for (const family of familyLibrary.families) {
      expect(calibrationStartLevel(family).level_id).toBe(family.levels[0].level_id);
    }
  });
});
