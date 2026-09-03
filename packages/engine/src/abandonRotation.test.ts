/**
 * ADR 0011 — abandoning a session rotates the template ("seen" recency) but stays invisible to
 * everything about load, fatigue and progress ("trained" recency). Both halves are pinned here,
 * because the whole risk of this change is one of them quietly drifting into the other.
 */
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import type { ProgressionFamilyId } from '@roamfit/data';
import { generateSession } from './pipeline';
import { createRng } from './rng';
import { calibrationStartLevel } from './progression/ladder';
import { defaultMicroForExercise } from './progression/micro';
import { DEFAULT_ANCHORS_AVAILABLE } from './filters/hardFilters';
import { sessionsAgo, recencyTier } from './selection/candidates';
import { overWorkedMuscles, recentHardMuscles } from './selection/volume';
import { assessComeback } from './progression/comeback';
import type { ProgressionState, SessionHistoryRecord, UserState } from './types';

const library = exerciseLibrary.exercises;
const families = familyLibrary.families;
const TODAY = '2026-08-30';

function userState(history: SessionHistoryRecord[]): UserState {
  const progressionStates = {} as Record<ProgressionFamilyId, ProgressionState>;
  for (const family of families) {
    const level = calibrationStartLevel(family);
    const exercise = library.find((e) => e.id === level.anchor_exercise_id)!;
    progressionStates[family.id] = {
      familyId: family.id,
      levelId: level.level_id,
      micro: defaultMicroForExercise(exercise),
      calibrating: true,
      consecutiveHits: 0,
      consecutiveMisses: 0,
      lastLevelChangeAt: null,
    };
  }
  return {
    profile: {
      units: 'lb',
      weeklyTarget: 3,
      limitations: [],
      anchorsAvailable: [...DEFAULT_ANCHORS_AVAILABLE],
      disabledExerciseIds: [],
    },
    exerciseStates: {},
    progressionStates,
    history,
    hasEverCompletedSession: history.some((s) => s.status === 'completed'),
  };
}

function generate(history: SessionHistoryRecord[], seed: number) {
  return generateSession({
    library: exerciseLibrary,
    families: familyLibrary,
    userState: userState(history),
    request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
    clock: { today: TODAY, tzId: 'America/Chicago' },
    rng: createRng(seed),
  });
}

function asHistory(
  plan: ReturnType<typeof generateSession>,
  status: 'completed' | 'discarded',
  localDate = '2026-08-29',
): SessionHistoryRecord {
  return {
    localDate,
    focus: 'full',
    difficulty: 'medium',
    status,
    entries: [...plan.warmup, ...plan.main, ...plan.cooldown].map((e) => ({
      exerciseId: e.exerciseId,
      role: e.role,
      difficulty: e.difficulty,
      sets: e.sets,
    })),
  } as unknown as SessionHistoryRecord;
}

describe('ADR 0011 — abandoning rotates the template (seen)', () => {
  it('generate -> abandon -> generate changes the main block', () => {
    const first = generate([], 1);
    // Same seed and same progression state: before ADR 0011 this was byte-identical.
    const second = generate([asHistory(first, 'discarded')], 1);
    expect(second.main.map((e) => e.exerciseId)).not.toEqual(first.main.map((e) => e.exerciseId));
  });

  it('rotates the knee-dominant slot away from what was abandoned', () => {
    const first = generate([], 1);
    const second = generate([asHistory(first, 'discarded')], 1);
    expect(first.main[0].pattern).toBe('squat');
    expect(second.main[0].pattern).toBe('lunge');
  });

  it('does not re-offer a ladder sibling from the abandoned session when an alternative exists', () => {
    const first = generate([], 1);
    const second = generate([asHistory(first, 'discarded')], 1);
    const hingeFirst = first.main.find((e) => e.progressionFamilyId === 'hinge')!;
    const hingeSecond = second.main.find((e) => e.progressionFamilyId === 'hinge')!;
    expect(hingeSecond.exerciseId).not.toBe(hingeFirst.exerciseId);
    // ...but it is still the same rung. Abandoning changes what you see, never where you are.
    expect(hingeSecond.progressionLevelIdAtTime).toBe(hingeFirst.progressionLevelIdAtTime);
  });
});

describe('ADR 0011 — abandoning stays invisible to load and progress (trained)', () => {
  const plan = generate([], 1);
  const abandoned = [asHistory(plan, 'discarded')];
  const ids = plan.main.map((e) => e.exerciseId);

  it('does not count toward the §5.2 BLOCKED / soft-cooldown window', () => {
    for (const id of ids) {
      expect(sessionsAgo(abandoned, id, 'main')).toBeNull();
      expect(recencyTier(sessionsAgo(abandoned, id, 'main'))).toBe('preferred');
    }
  });

  it('does not mark muscles over-worked', () => {
    expect(overWorkedMuscles(abandoned, library, TODAY).size).toBe(0);
  });

  it('does not open a 48h recovery window', () => {
    expect(recentHardMuscles(abandoned, library, TODAY, 2).size).toBe(0);
  });

  it('does not reset the §9.4 comeback clock', () => {
    // Trained 10 days ago, then abandoned one yesterday. The abandoned session must not count as
    // "getting back to it" — the comeback treatment is still due.
    const trainedLongAgo = asHistory(plan, 'completed', '2026-08-20');
    const abandonedYesterday = asHistory(plan, 'discarded', '2026-08-29');
    expect(assessComeback([trainedLongAgo], TODAY).tier).toBe('week');
    expect(assessComeback([trainedLongAgo, abandonedYesterday], TODAY).tier).toBe('week');
    // ...whereas actually training yesterday does close the gap.
    const trainedYesterday = asHistory(plan, 'completed', '2026-08-29');
    expect(assessComeback([trainedLongAgo, trainedYesterday], TODAY).tier).toBe('none');
  });

  it('leaves every progression level exactly where it was', () => {
    const before = userState([]).progressionStates;
    const after = userState(abandoned).progressionStates;
    for (const family of families) {
      expect(after[family.id].levelId).toBe(before[family.id].levelId);
      expect(after[family.id].micro).toEqual(before[family.id].micro);
    }
  });

  it('does not make hasEverCompletedSession true', () => {
    expect(userState(abandoned).hasEverCompletedSession).toBe(false);
  });
});
