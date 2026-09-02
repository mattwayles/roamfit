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
import { DEFAULT_ANCHORS_AVAILABLE } from '../filters/hardFilters';

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

/**
 * A level's anchor is the exercise its progression math runs on (`exerciseForLevel`) and the one
 * named when the rung is displayed. So an anchor that the hard filters remove for most users, on a
 * rung a *sibling* still covers, breaks progression: the user climbs a ladder shaped for a movement
 * they are never shown. `vertical_push.l4` was exactly that — anchored on `bw-dip`, which needs the
 * non-default `body-support` anchor, while `banded-push-press` was what actually got programmed.
 *
 * A rung where NO sibling is default-available is a different, legitimate thing: it is gear-gated
 * end to end, nothing is programmed, and there is no mismatch to fix.
 */
describe('ladder anchors are reachable on the rungs that are reachable', () => {
  // The two rungs that still have this defect. They are known-broken and parked in
  // docs/BACKLOG.md — do NOT add to this list to make a new failure go away.
  const KNOWN_UNREACHABLE_ANCHORS = ['horizontal_push.l2', 'vertical_pull.l1'];

  function offendingLevels(): string[] {
    const byId = new Map(library.map((e) => [e.id, e]));
    const offenders: string[] = [];
    for (const family of families) {
      for (const level of family.levels) {
        const anchor = byId.get(level.anchor_exercise_id);
        if (!anchor || DEFAULT_ANCHORS_AVAILABLE.includes(anchor.anchor)) continue;
        const coveredBySibling = level.exercise_ids.some((id) => {
          const ex = byId.get(id);
          return ex && ex.id !== anchor.id && DEFAULT_ANCHORS_AVAILABLE.includes(ex.anchor);
        });
        if (coveredBySibling) offenders.push(level.level_id);
      }
    }
    return offenders;
  }

  it('no rung is anchored on a filtered-out exercise while a sibling covers it', () => {
    expect(offendingLevels().sort()).toEqual([...KNOWN_UNREACHABLE_ANCHORS].sort());
  });

  it('vertical_push.l4 is anchored on the exercise users are actually given', () => {
    const verticalPush = findFamily(families, 'vertical_push')!;
    const anchor = exerciseForLevel(verticalPush, 'vertical_push.l4', library)!;
    expect(anchor.id).toBe('banded-push-press');
    expect(DEFAULT_ANCHORS_AVAILABLE).toContain(anchor.anchor);
    // The band rung it was always meant to be: micro-progression can now climb B2 -> B3, which it
    // could not while the anchor was a bodyweight exercise.
    expect(anchor.equipment).toBe('band');
    // bw-dip is kept as a sibling — it is a real vertical push for anyone who ticks "Bench or
    // step"; it just should not be the rung's reference movement.
    const level = verticalPush.levels.find((l) => l.level_id === 'vertical_push.l4')!;
    expect(level.exercise_ids).toContain('bw-dip');
  });
});
