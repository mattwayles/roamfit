import type { Exercise } from '@roamfit/data';
import { createRng } from '../rng';
import type { ExerciseState, SessionHistoryRecord, UserState } from '../types';
import { selectWarmupCooldown } from './warmupCooldown';

function ex(id: string, focus: Exercise['focus'] = ['abs']): Exercise {
  return {
    id,
    name: id,
    aliases: [],
    focus,
    pattern: 'flexion',
    primary: ['abs'],
    secondary: [],
    equipment: 'bodyweight',
    band: null,
    anchor: 'none',
    anchor_class: 'none',
    unilateral: false,
    metric: 'time',
    default_seconds: 45,
    tier: 'core',
    role: 'warmup',
    difficulty: 'easy',
    progression_family: null,
    progression_level_id: null,
    contraindications: [],
    setup: '',
    video_search: '',
    demo_media: { type: 'figure', id },
  };
}

function userState(overrides: Partial<UserState> = {}): UserState {
  return {
    profile: { units: 'lb', weeklyTarget: 3, limitations: [], anchorsAvailable: [] },
    exerciseStates: {},
    progressionStates: {} as UserState['progressionStates'],
    history: [],
    hasEverCompletedSession: true,
    ...overrides,
  };
}

const TODAY = '2026-08-30';

describe('warmup/cooldown light rotation (ADR 0001)', () => {
  it('excludes only the immediately-previous pick when an alternative exists', () => {
    const a = ex('wu-a');
    const b = ex('wu-b');
    const history: SessionHistoryRecord[] = [
      {
        localDate: '2026-08-29',
        focus: 'abs',
        effort: 'normal',
        status: 'completed',
        entries: [{ exerciseId: 'wu-a', role: 'warmup', effort: 'normal' }],
      },
    ];
    // Run many seeds to confirm 'a' is never returned once excluded (not a probabilistic dodge).
    for (let seed = 0; seed < 20; seed++) {
      const picked = selectWarmupCooldown({
        role: 'warmup',
        pool: [a, b],
        focus: 'abs',
        userState: userState({ history }),
        today: TODAY,
        rng: createRng(seed),
      });
      expect(picked?.id).toBe('wu-b');
    }
  });

  it('drops the exclusion rather than returning null when the pool would otherwise be empty', () => {
    const onlyOne = ex('wu-only');
    const history: SessionHistoryRecord[] = [
      {
        localDate: '2026-08-29',
        focus: 'abs',
        effort: 'normal',
        status: 'completed',
        entries: [{ exerciseId: 'wu-only', role: 'warmup', effort: 'normal' }],
      },
    ];
    const picked = selectWarmupCooldown({
      role: 'warmup',
      pool: [onlyOne],
      focus: 'abs',
      userState: userState({ history }),
      today: TODAY,
      rng: createRng(1),
    });
    expect(picked?.id).toBe('wu-only');
  });

  it('avoids a <=2 enjoyment pick when an alternative exists, even for warmup/cooldown', () => {
    const disliked = ex('wu-disliked');
    const fine = ex('wu-fine');
    const states: Record<string, ExerciseState> = {
      'wu-disliked': {
        exerciseId: 'wu-disliked',
        lastPerformedAt: null,
        sessionsPerformed: 1,
        bestSet: null,
        difficultyEma: 0,
        enjoymentEma: 1,
        skipCount: 0,
        swapAwayCount: 0,
        removeAtApprovalCount: 0,
        pinnedNote: null,
        suppressedUntil: null,
      },
    };
    for (let seed = 0; seed < 20; seed++) {
      const picked = selectWarmupCooldown({
        role: 'warmup',
        pool: [disliked, fine],
        focus: 'abs',
        userState: userState({ exerciseStates: states }),
        today: TODAY,
        rng: createRng(seed),
      });
      expect(picked?.id).toBe('wu-fine');
    }
  });

  it('returns null only when the role pool is genuinely empty', () => {
    const picked = selectWarmupCooldown({
      role: 'cooldown',
      pool: [],
      focus: 'abs',
      userState: userState(),
      today: TODAY,
      rng: createRng(1),
    });
    expect(picked).toBeNull();
  });
});
