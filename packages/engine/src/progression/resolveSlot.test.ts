import { familyLibrary, exerciseLibrary } from '@roamfit/data';
import type { ProgressionFamily, ProgressionFamilyId } from '@roamfit/data';
import { resolveLadderSlot } from './resolveSlot';
import { calibrationStartLevel, findFamily } from './ladder';
import { defaultMicroForExercise } from './micro';
import { createRng } from '../rng';
import type { ProgressionState } from '../types';

const library = exerciseLibrary.exercises;
const families = familyLibrary.families;
const horizontalPush = findFamily(families, 'horizontal_push')!;

function allFamilyStates(
  overrides: Partial<Record<ProgressionFamilyId, ProgressionState>> = {},
): Record<ProgressionFamilyId, ProgressionState> {
  const out = {} as Record<ProgressionFamilyId, ProgressionState>;
  for (const family of families) {
    const level = calibrationStartLevel(family);
    const exercise = library.find((e) => e.id === level.anchor_exercise_id)!;
    out[family.id] = {
      familyId: family.id,
      levelId: level.level_id,
      micro: defaultMicroForExercise(exercise),
      calibrating: false,
      consecutiveHits: 0,
      consecutiveMisses: 0,
      lastLevelChangeAt: null,
    };
  }
  return { ...out, ...overrides };
}

describe('resolveLadderSlot', () => {
  it('returns the exercise at the current level when it survives the hard filters', () => {
    const states = allFamilyStates({
      horizontal_push: {
        familyId: 'horizontal_push',
        levelId: 'horizontal_push.l5', // banded-push-up
        micro: defaultMicroForExercise(library.find((e) => e.id === 'banded-push-up')!),
        calibrating: false,
        consecutiveHits: 0,
        consecutiveMisses: 0,
        lastLevelChangeAt: null,
      },
    });
    const result = resolveLadderSlot({
      familyId: 'horizontal_push',
      families,
      library,
      progressionStates: states,
      hardFilteredPool: library, // nothing filtered
      rng: createRng(1),
      includeLowerRungs: false, // this test is about the walk-down mechanism, not track 14's recall
    });
    // Any exercise on that rung is a correct answer (ADR 0010) — what matters is that it came
    // from level 5 and was not a walk-down.
    const l5 = horizontalPush.levels.find((l) => l.level_id === 'horizontal_push.l5')!;
    expect(l5.exercise_ids).toContain(result!.exercise.id);
    expect(result?.substitutedFrom).toBeUndefined();
  });

  it('walks down the ladder when every exercise at the current level fails a hard filter, and flags it', () => {
    const states = allFamilyStates({
      horizontal_push: {
        familyId: 'horizontal_push',
        levelId: 'horizontal_push.l5', // banded-push-up
        micro: defaultMicroForExercise(library.find((e) => e.id === 'banded-push-up')!),
        calibrating: false,
        consecutiveHits: 0,
        consecutiveMisses: 0,
        lastLevelChangeAt: null,
      },
    });
    const l5 = horizontalPush.levels.find((l) => l.level_id === 'horizontal_push.l5')!;
    const l4 = horizontalPush.levels.find((l) => l.level_id === 'horizontal_push.l4')!;
    const withoutL5 = library.filter((e) => !l5.exercise_ids.includes(e.id));
    const result = resolveLadderSlot({
      familyId: 'horizontal_push',
      families,
      library,
      progressionStates: states,
      hardFilteredPool: withoutL5,
      rng: createRng(1),
      includeLowerRungs: false, // this test is about the walk-down mechanism, not track 14's recall
    });
    expect(l4.exercise_ids).toContain(result!.exercise.id);
    // substitutedFrom names the level's anchor — that is what progression is parked on.
    expect(result?.substitutedFrom).toEqual({
      levelId: 'horizontal_push.l5',
      exerciseId: 'banded-push-up',
    });
  });

  it('is undefined when every level of the ladder fails the hard filters (a PATTERN GAP for the caller)', () => {
    const states = allFamilyStates({
      horizontal_push: {
        familyId: 'horizontal_push',
        levelId: 'horizontal_push.l2',
        micro: defaultMicroForExercise(library.find((e) => e.id === 'bw-incline-push-up')!),
        calibrating: false,
        consecutiveHits: 0,
        consecutiveMisses: 0,
        lastLevelChangeAt: null,
      },
    });
    // Every exercise on every rung — siblings included (ADR 0010), not just the anchors, or the
    // ladder would still have something to resolve to.
    const horizontalPushIds = new Set(horizontalPush.levels.flatMap((l) => l.exercise_ids));
    const withoutHorizontalPush = library.filter((e) => !horizontalPushIds.has(e.id));
    const result = resolveLadderSlot({
      familyId: 'horizontal_push',
      families,
      library,
      progressionStates: states,
      hardFilteredPool: withoutHorizontalPush,
      rng: createRng(1),
    });
    expect(result).toBeUndefined();
  });

  it('is undefined for an unknown family id', () => {
    const result = resolveLadderSlot({
      familyId: 'not_a_real_family' as ProgressionFamilyId,
      families,
      library,
      progressionStates: allFamilyStates(),
      hardFilteredPool: library,
      rng: createRng(1),
    });
    expect(result).toBeUndefined();
  });
});

// ADR 0010 — sibling exercises at one level. Built by hand rather than read from families.json
// so these stay true regardless of how the shipped ladders are later populated.
describe('resolveLadderSlot — sibling selection (ADR 0010)', () => {
  const SIBLINGS = ['bw-knee-push-up', 'bw-wide-push-up', 'floor-press'];

  const familiesWithSiblings: ProgressionFamily[] = families.map((f) =>
    f.id !== 'horizontal_push'
      ? f
      : {
          ...f,
          levels: f.levels.map((l) =>
            l.level_id === 'horizontal_push.l3'
              ? { ...l, anchor_exercise_id: 'bw-knee-push-up', exercise_ids: [...SIBLINGS] }
              : l,
          ),
        },
  );

  function atL3(): Record<ProgressionFamilyId, ProgressionState> {
    return allFamilyStates({
      horizontal_push: {
        familyId: 'horizontal_push',
        levelId: 'horizontal_push.l3',
        micro: defaultMicroForExercise(library.find((e) => e.id === 'bw-knee-push-up')!),
        calibrating: false,
        consecutiveHits: 0,
        consecutiveMisses: 0,
        lastLevelChangeAt: null,
      },
    });
  }

  function resolve(seed: number, recentExerciseIds?: ReadonlySet<string>) {
    return resolveLadderSlot({
      familyId: 'horizontal_push',
      families: familiesWithSiblings,
      library,
      progressionStates: atL3(),
      hardFilteredPool: library,
      rng: createRng(seed),
      recentExerciseIds,
      // This block is about ADR 0010 sibling selection at ONE level, not track 14's cross-rung
      // recall — isolate it from the current/lower-rung weighting so its assertions stay exact.
      includeLowerRungs: false,
    });
  }

  it('programs different siblings across seeds, all from the same level', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) seen.add(resolve(seed)!.exercise.id);
    expect(seen.size).toBeGreaterThan(1);
    for (const id of seen) expect(SIBLINGS).toContain(id);
  });

  it('never changes levelId — which sibling ran carries no progression meaning', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const result = resolve(seed)!;
      expect(result.state.levelId).toBe('horizontal_push.l3');
      expect(result.substitutedFrom).toBeUndefined();
    }
  });

  it('skips a sibling programmed last session while an alternative exists', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const result = resolve(seed, new Set(['bw-knee-push-up']))!;
      expect(result.exercise.id).not.toBe('bw-knee-push-up');
    }
  });

  it('falls back to the full set when every sibling was used last session', () => {
    const result = resolve(1, new Set(SIBLINGS));
    expect(SIBLINGS).toContain(result!.exercise.id);
  });

  it('only offers siblings that survive the hard filters', () => {
    const pool = library.filter((e) => e.id !== 'bw-knee-push-up' && e.id !== 'bw-wide-push-up');
    for (let seed = 1; seed <= 20; seed++) {
      const result = resolveLadderSlot({
        familyId: 'horizontal_push',
        families: familiesWithSiblings,
        library,
        progressionStates: atL3(),
        hardFilteredPool: pool,
        rng: createRng(seed),
        includeLowerRungs: false,
      });
      expect(result!.exercise.id).toBe('floor-press');
      expect(result!.substitutedFrom).toBeUndefined(); // still level 3, not a walk-down
    }
  });

  it('walks down a level only when every sibling is filtered out', () => {
    const pool = library.filter((e) => !SIBLINGS.includes(e.id));
    const result = resolveLadderSlot({
      familyId: 'horizontal_push',
      families: familiesWithSiblings,
      library,
      progressionStates: atL3(),
      hardFilteredPool: pool,
      rng: createRng(1),
      includeLowerRungs: false,
    });
    expect(result!.exercise.id).toBe('bw-incline-push-up'); // l2's anchor
    // substitutedFrom names the level's anchor — that is what progression is parked on.
    expect(result!.substitutedFrom).toEqual({
      levelId: 'horizontal_push.l3',
      exerciseId: 'bw-knee-push-up',
    });
  });
});
