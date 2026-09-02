import type { Exercise } from '@roamfit/data';
import { createRng } from '../rng';
import type { ExerciseState, SessionHistoryRecord, UserState } from '../types';
import { selectWarmupCooldown, selectWarmupCooldownGroup } from './warmupCooldown';
import { prescribeWarmupCooldown } from '../prescription/prescribe';

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
    roles: ['warmup'],
    difficulty: 'easy',
    progression_family: null,
    progression_level_id: null,
    contraindications: [],
    setup: '',
    video_search: '',
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

describe('selectWarmupCooldownGroup — §5.6 fills the budgeted minutes, not a fixed count', () => {
  // Each of these times exactly (12 reps x 2s tempo x 1) + 0 rest + 30 = 54s via
  // prescribeWarmupCooldown's reps-based formula (metric 'reps', unlike the 'time' fixture above).
  function repsEx(id: string): Exercise {
    return {
      id,
      name: id,
      aliases: [],
      focus: ['abs'],
      pattern: 'flexion',
      primary: ['abs'],
      secondary: [],
      equipment: 'bodyweight',
      band: null,
      anchor: 'none',
      anchor_class: 'none',
      unilateral: false,
      metric: 'reps',
      default_seconds: null,
      tier: 'core',
      roles: ['warmup'],
      difficulty: 'easy',
      progression_family: null,
      progression_level_id: null,
      contraindications: [],
      setup: '',
      video_search: '',
    };
  }

  it('picks distinct exercises (no repeats within one call) until close to the target, not a fixed count', () => {
    const pool = ['a', 'b', 'c', 'd', 'e'].map(repsEx); // 54s each
    const picked = selectWarmupCooldownGroup({
      role: 'warmup',
      pool,
      focus: 'abs',
      userState: userState(),
      today: TODAY,
      rng: createRng(1),
      targetSec: 180, // 3 minutes — the actual §5.6 floor value for many target lengths
    });
    expect(new Set(picked.map((e) => e.id)).size).toBe(picked.length); // no repeats
    const total = picked.reduce((a, e) => a + prescribeWarmupCooldown(e, 'warmup').estimatedSec, 0);
    // Old (round-1) behavior routinely added one exercise past target (216s/4 exercises for a
    // 180s budget). This should stop once reasonably close, not go on padding.
    expect(picked.length).toBeLessThanOrEqual(3);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(180 * 1.3);
  });

  it('always returns at least one, even if it alone would exceed the target', () => {
    const bigOne = repsEx('big'); // 54s vs. a tiny 10s target
    const picked = selectWarmupCooldownGroup({
      role: 'warmup',
      pool: [bigOne],
      focus: 'abs',
      userState: userState(),
      today: TODAY,
      rng: createRng(1),
      targetSec: 10,
    });
    expect(picked.map((e) => e.id)).toEqual(['big']);
  });

  it('returns an empty array when the role pool is genuinely empty', () => {
    const picked = selectWarmupCooldownGroup({
      role: 'cooldown',
      pool: [],
      focus: 'abs',
      userState: userState(),
      today: TODAY,
      rng: createRng(1),
      targetSec: 180,
    });
    expect(picked).toEqual([]);
  });
});
