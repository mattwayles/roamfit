import { familyLibrary, exerciseLibrary } from '@roamfit/data';
import type { ProgressionFamilyId } from '@roamfit/data';
import { applyComebackToProgressionStates, assessComeback } from './comeback';
import { calibrationStartLevel } from './ladder';
import { defaultMicroForExercise } from './micro';
import type { ProgressionState, SessionHistoryRecord } from '../types';

const library = exerciseLibrary.exercises;
const families = familyLibrary.families;
const TODAY = '2026-08-30';

function historyEndingOn(localDate: string): SessionHistoryRecord[] {
  return [{ localDate, focus: 'upper', effort: 'normal', status: 'completed', entries: [] }];
}

/**
 * Every user has progression state for all 8 v1 families from cold start (§6.5 seeds them all
 * at once, not lazily) — `UserState.progressionStates` in types.ts is a full `Record`, not a
 * `Partial`, on purpose. Test fixtures below build a complete map and override the family under
 * test, rather than loosening the (correct) full-map contract.
 */
function allFamilyStates(
  overrides: Partial<Record<ProgressionFamilyId, ProgressionState>> = {},
): Record<ProgressionFamilyId, ProgressionState> {
  const out = {} as Record<ProgressionFamilyId, ProgressionState>;
  for (const family of families) {
    const level = calibrationStartLevel(family);
    const exercise = library.find((e) => e.id === level.exercise_id)!;
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

describe('§9.4 the comeback path', () => {
  it('no gap flag under 7 days', () => {
    expect(assessComeback(historyEndingOn('2026-08-25'), TODAY).tier).toBe('none');
  });

  it('7-20 days is the "week" tier: ~20% volume cut and the welcome-back copy, no gap length mentioned', () => {
    const result = assessComeback(historyEndingOn('2026-08-23'), TODAY); // 7 days
    expect(result.tier).toBe('week');
    expect(result.volumeMultiplier).toBeCloseTo(0.8);
    expect(result.notice).toBe('Welcome back — let’s ease in.');
    expect(result.notice).not.toMatch(/\d+ days?/);
  });

  it('21+ days is the "reset" tier', () => {
    const result = assessComeback(historyEndingOn('2026-08-01'), TODAY); // 29 days
    expect(result.tier).toBe('reset');
  });

  it('no history at all is not a comeback (first-ever session)', () => {
    expect(assessComeback([], TODAY).tier).toBe('none');
  });

  it('"week" tier regresses every family one micro-step', () => {
    const family = families.find((f) => f.id === 'horizontal_push')!;
    const exId = family.levels.find((l) => l.level_id === 'horizontal_push.l3')!.exercise_id;
    const exercise = library.find((e) => e.id === exId)!;
    const advancedMicro = { ...defaultMicroForExercise(exercise), repTarget: 12 };
    const states = allFamilyStates({
      horizontal_push: {
        familyId: 'horizontal_push',
        levelId: 'horizontal_push.l3',
        micro: advancedMicro,
        calibrating: false,
        consecutiveHits: 0,
        consecutiveMisses: 0,
        lastLevelChangeAt: null,
      },
    });
    const out = applyComebackToProgressionStates(states, families, library, 'week');
    expect(out.horizontal_push.micro.repTarget).toBe(11);
    expect(out.horizontal_push.levelId).toBe('horizontal_push.l3'); // never drops a level for a comeback
  });

  it('"reset" tier puts every family back into calibration without changing level_id', () => {
    const states = allFamilyStates({
      horizontal_push: {
        familyId: 'horizontal_push',
        levelId: 'horizontal_push.l5',
        micro: defaultMicroForExercise(library.find((e) => e.id === 'banded-push-up')!),
        calibrating: false,
        consecutiveHits: 3,
        consecutiveMisses: 0,
        lastLevelChangeAt: '2026-07-01',
      },
    });
    const out = applyComebackToProgressionStates(states, families, library, 'reset');
    expect(out.horizontal_push.calibrating).toBe(true);
    expect(out.horizontal_push.levelId).toBe('horizontal_push.l5');
    expect(out.horizontal_push.consecutiveHits).toBe(0);
  });

  it('"none" tier is a no-op copy', () => {
    const states = allFamilyStates();
    const out = applyComebackToProgressionStates(states, families, library, 'none');
    expect(out).toEqual(states);
    expect(out).not.toBe(states); // a copy, not the same reference
  });
});
