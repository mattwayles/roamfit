import type { Exercise } from '@roamfit/data';
import { createRng } from '../rng';
import type { ExerciseState, SessionHistoryRecord, UserState } from '../types';
import { selectMain } from './mainSelection';
import type { TemplateSlot } from '../template/focusTemplate';

let counter = 0;
function ex(overrides: Partial<Exercise>): Exercise {
  counter++;
  return {
    id: overrides.id ?? `ex-${counter}`,
    name: overrides.id ?? `Exercise ${counter}`,
    aliases: [],
    focus: overrides.focus ?? ['upper'],
    pattern: overrides.pattern ?? 'horizontal_push',
    primary: overrides.primary ?? ['chest'],
    secondary: overrides.secondary ?? [],
    equipment: overrides.equipment ?? 'band',
    band: overrides.equipment === 'bodyweight' ? null : 'B1-B3',
    anchor: overrides.anchor ?? 'none',
    anchor_class: overrides.anchor_class ?? 'none',
    unilateral: false,
    metric: 'reps',
    default_seconds: null,
    tier: overrides.tier ?? 'core',
    role: 'main',
    difficulty: 'medium',
    progression_family: null,
    progression_level_id: null,
    contraindications: [],
    setup: 'setup',
    video_search: 'https://example.com',
    ...overrides,
  };
}

function state(overrides: Partial<ExerciseState> = {}): ExerciseState {
  return {
    exerciseId: '',
    lastPerformedAt: null,
    sessionsPerformed: 1,
    bestSet: null,
    difficultyEma: 0,
    enjoymentEma: 3,
    skipCount: 0,
    swapAwayCount: 0,
    removeAtApprovalCount: 0,
    pinnedNote: null,
    suppressedUntil: null,
    ...overrides,
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

function slot(id: string, pattern: Exercise['pattern']): TemplateSlot {
  return { id, patterns: [pattern], required: true };
}

const rng = () => createRng(42);
const TODAY = '2026-08-30';

describe('§5.2 selection rules', () => {
  it('BLOCKED — never programs an exercise used as main within the last 2 sessions', () => {
    const a = ex({ id: 'a', pattern: 'horizontal_push' });
    const b = ex({ id: 'b', pattern: 'horizontal_push' });
    const history: SessionHistoryRecord[] = [
      {
        localDate: '2026-08-29',
        focus: 'upper',
        effort: 'normal',
        status: 'completed',
        entries: [{ exerciseId: 'a', role: 'main', effort: 'normal' }],
      },
    ];
    const result = selectMain({
      slots: [slot('s1', 'horizontal_push')],
      pool: [a, b],
      poolIgnoringEquipment: [a, b],
      userState: userState({ history }),
      today: TODAY,
      rng: rng(),
      focus: 'upper',
      equipmentPreference: 'any',
    });
    expect(result.picks.map((p) => p.exercise.id)).toEqual(['b']);
  });

  it('SOFT COOLDOWN only fills a slot nothing else covers — preferred beats soft even with lower enjoyment', () => {
    const preferredEx = ex({ id: 'pref', pattern: 'horizontal_push' });
    const softEx = ex({ id: 'soft', pattern: 'horizontal_push' });
    // 4 sessions ago (the 4th-from-most-recent non-discarded session) -> soft tier for 'soft'.
    const history: SessionHistoryRecord[] = [
      {
        localDate: '2026-08-22',
        focus: 'abs',
        effort: 'normal',
        status: 'completed',
        entries: [{ exerciseId: 'soft', role: 'main', effort: 'normal' }],
      },
      {
        localDate: '2026-08-24',
        focus: 'abs',
        effort: 'normal',
        status: 'completed',
        entries: [{ exerciseId: 'filler', role: 'main', effort: 'normal' }],
      },
      {
        localDate: '2026-08-26',
        focus: 'abs',
        effort: 'normal',
        status: 'completed',
        entries: [{ exerciseId: 'filler', role: 'main', effort: 'normal' }],
      },
      {
        localDate: '2026-08-28',
        focus: 'abs',
        effort: 'normal',
        status: 'completed',
        entries: [{ exerciseId: 'filler', role: 'main', effort: 'normal' }],
      },
    ];
    const result = selectMain({
      slots: [slot('s1', 'horizontal_push')],
      pool: [preferredEx, softEx],
      poolIgnoringEquipment: [preferredEx, softEx],
      userState: userState({
        history,
        exerciseStates: { soft: state({ exerciseId: 'soft', enjoymentEma: 5 }) },
      }),
      today: TODAY,
      rng: rng(),
      focus: 'upper',
      equipmentPreference: 'any',
    });
    expect(result.picks[0].exercise.id).toBe('pref');
  });

  it('SOFT COOLDOWN is used when it is the only thing covering the slot', () => {
    const softEx = ex({ id: 'soft-only', pattern: 'horizontal_push' });
    const history: SessionHistoryRecord[] = [
      {
        localDate: '2026-08-22',
        focus: 'abs',
        effort: 'normal',
        status: 'completed',
        entries: [{ exerciseId: 'soft-only', role: 'main', effort: 'normal' }],
      },
      {
        localDate: '2026-08-24',
        focus: 'abs',
        effort: 'normal',
        status: 'completed',
        entries: [{ exerciseId: 'filler2', role: 'main', effort: 'normal' }],
      },
      {
        localDate: '2026-08-26',
        focus: 'abs',
        effort: 'normal',
        status: 'completed',
        entries: [{ exerciseId: 'filler2', role: 'main', effort: 'normal' }],
      },
      {
        localDate: '2026-08-28',
        focus: 'abs',
        effort: 'normal',
        status: 'completed',
        entries: [{ exerciseId: 'filler2', role: 'main', effort: 'normal' }],
      },
    ];
    const result = selectMain({
      slots: [slot('s1', 'horizontal_push')],
      pool: [softEx],
      poolIgnoringEquipment: [softEx],
      userState: userState({ history }),
      today: TODAY,
      rng: rng(),
      focus: 'upper',
      equipmentPreference: 'any',
    });
    expect(result.picks[0].exercise.id).toBe('soft-only');
  });

  it('novelty — includes at least one never-performed exercise when one fits a slot', () => {
    const performed = ex({ id: 'performed', pattern: 'horizontal_push' });
    const novel = ex({ id: 'novel', pattern: 'horizontal_pull' });
    const performedPull = ex({ id: 'performed-pull', pattern: 'horizontal_pull' });
    const result = selectMain({
      slots: [slot('s1', 'horizontal_push'), slot('s2', 'horizontal_pull')],
      pool: [performed, novel, performedPull],
      poolIgnoringEquipment: [performed, novel, performedPull],
      userState: userState({
        exerciseStates: {
          performed: state({ exerciseId: 'performed', sessionsPerformed: 5, enjoymentEma: 5 }),
          'performed-pull': state({
            exerciseId: 'performed-pull',
            sessionsPerformed: 5,
            enjoymentEma: 5,
          }),
        },
      }),
      today: TODAY,
      rng: rng(),
      focus: 'upper',
      equipmentPreference: 'any',
    });
    expect(result.picks.some((p) => p.exercise.id === 'novel')).toBe(true);
  });

  it('OVER-WORKED muscle — never programmed as a primary mover (chest over-worked, arm still fine)', () => {
    const chestEx = ex({ id: 'chest-move', pattern: 'horizontal_push', primary: ['chest'] });
    const armEx = ex({ id: 'arm-move', pattern: 'horizontal_push', primary: ['triceps'] });
    // 7-day trailing volume: chest trained heavily (6 credits), triceps lightly (1 credit) ->
    // mean = 3.5, chest (6 > 1.5*3.5=5.25) is over-worked, triceps is not.
    const history: SessionHistoryRecord[] = [
      {
        localDate: '2026-08-28',
        focus: 'upper',
        effort: 'normal',
        status: 'completed',
        entries: [
          { exerciseId: 'chest-history-1', role: 'main', effort: 'normal', sets: 3 },
          { exerciseId: 'chest-history-2', role: 'main', effort: 'normal', sets: 3 },
          { exerciseId: 'triceps-history', role: 'main', effort: 'normal', sets: 1 },
        ],
      },
    ];
    const chestHistory1 = ex({
      id: 'chest-history-1',
      pattern: 'horizontal_push',
      primary: ['chest'],
    });
    const chestHistory2 = ex({
      id: 'chest-history-2',
      pattern: 'horizontal_push',
      primary: ['chest'],
    });
    const tricepsHistory = ex({
      id: 'triceps-history',
      pattern: 'elbow_extension',
      primary: ['triceps'],
    });
    const result = selectMain({
      slots: [slot('s1', 'horizontal_push')],
      pool: [chestEx, armEx, chestHistory1, chestHistory2, tricepsHistory],
      poolIgnoringEquipment: [chestEx, armEx, chestHistory1, chestHistory2, tricepsHistory],
      userState: userState({ history }),
      today: TODAY,
      rng: rng(),
      focus: 'upper',
      equipmentPreference: 'any',
    });
    expect(result.picks[0]?.exercise.id).toBe('arm-move');
  });

  it('48h recovery — a second exercise on a recently-hard muscle is avoided when an alternative exists', () => {
    const shoulderA = ex({
      id: 'shoulder-a',
      pattern: 'horizontal_push',
      primary: ['front_delts'],
    });
    const shoulderB = ex({ id: 'shoulder-b', pattern: 'vertical_push', primary: ['front_delts'] });
    const legMove = ex({ id: 'leg-alt', pattern: 'vertical_push', primary: ['quads'] });
    const history: SessionHistoryRecord[] = [
      {
        localDate: '2026-08-29',
        focus: 'upper',
        effort: 'hard',
        status: 'completed',
        entries: [{ exerciseId: 'yesterday-shoulder', role: 'main', effort: 'hard' }],
      },
    ];
    const yesterdayShoulder = ex({
      id: 'yesterday-shoulder',
      pattern: 'horizontal_push',
      primary: ['front_delts'],
    });
    const result = selectMain({
      slots: [slot('s1', 'horizontal_push'), slot('s2', 'vertical_push')],
      pool: [shoulderA, shoulderB, legMove, yesterdayShoulder],
      poolIgnoringEquipment: [shoulderA, shoulderB, legMove, yesterdayShoulder],
      userState: userState({ history }),
      today: TODAY,
      rng: rng(),
      focus: 'upper',
      equipmentPreference: 'any',
    });
    // yesterday-shoulder is itself 1 session ago -> BLOCKED, excluded regardless.
    // s1 must pick shoulder-a (only horizontal_push option, touches front_delts: allowed once).
    // s2 should prefer leg-alt over shoulder-b since the recovery allowance is already used.
    expect(result.picks.find((p) => p.slotId === 's1')?.exercise.id).toBe('shoulder-a');
    expect(result.picks.find((p) => p.slotId === 's2')?.exercise.id).toBe('leg-alt');
  });

  it('enjoyment — avoids a rating <=2 exercise when an alternative fills the slot', () => {
    const disliked = ex({ id: 'disliked', pattern: 'horizontal_push' });
    const neutral = ex({ id: 'neutral', pattern: 'horizontal_push' });
    const result = selectMain({
      slots: [slot('s1', 'horizontal_push')],
      pool: [disliked, neutral],
      poolIgnoringEquipment: [disliked, neutral],
      userState: userState({
        exerciseStates: { disliked: state({ exerciseId: 'disliked', enjoymentEma: 1 }) },
      }),
      today: TODAY,
      rng: rng(),
      focus: 'upper',
      equipmentPreference: 'any',
    });
    expect(result.picks[0].exercise.id).toBe('neutral');
  });

  it('enjoyment — a rating <=2 exercise is still used when it is the only thing filling the slot', () => {
    const disliked = ex({ id: 'disliked-only', pattern: 'horizontal_push' });
    const result = selectMain({
      slots: [slot('s1', 'horizontal_push')],
      pool: [disliked],
      poolIgnoringEquipment: [disliked],
      userState: userState({
        exerciseStates: {
          'disliked-only': state({ exerciseId: 'disliked-only', enjoymentEma: 1 }),
        },
      }),
      today: TODAY,
      rng: rng(),
      focus: 'upper',
      equipmentPreference: 'any',
    });
    expect(result.picks[0].exercise.id).toBe('disliked-only');
  });

  it('REPEATEDLY-SKIPPED suppression — an exercise with an active suppressedUntil is never picked', () => {
    const suppressed = ex({ id: 'suppressed', pattern: 'horizontal_push' });
    const other = ex({ id: 'other', pattern: 'horizontal_push' });
    const result = selectMain({
      slots: [slot('s1', 'horizontal_push')],
      pool: [suppressed, other],
      poolIgnoringEquipment: [suppressed, other],
      userState: userState({
        exerciseStates: {
          suppressed: state({ exerciseId: 'suppressed', suppressedUntil: '2026-09-15' }),
        },
      }),
      today: TODAY,
      rng: rng(),
      focus: 'upper',
      equipmentPreference: 'any',
    });
    expect(result.picks.some((p) => p.exercise.id === 'suppressed')).toBe(false);
  });

  it('a suppression that has already expired no longer excludes the exercise', () => {
    const wasSuppressed = ex({ id: 'was-suppressed', pattern: 'horizontal_push' });
    const result = selectMain({
      slots: [slot('s1', 'horizontal_push')],
      pool: [wasSuppressed],
      poolIgnoringEquipment: [wasSuppressed],
      userState: userState({
        exerciseStates: {
          'was-suppressed': state({ exerciseId: 'was-suppressed', suppressedUntil: '2026-08-01' }),
        },
      }),
      today: TODAY,
      rng: rng(),
      focus: 'upper',
      equipmentPreference: 'any',
    });
    expect(result.picks[0]?.exercise.id).toBe('was-suppressed');
  });

  it('>=50% of main work defaults to bands across the session', () => {
    const slots = [
      slot('s1', 'horizontal_push'),
      slot('s2', 'horizontal_pull'),
      slot('s3', 'vertical_push'),
      slot('s4', 'vertical_pull'),
    ];
    const pool = [
      ex({ id: 'bw1', pattern: 'horizontal_push', equipment: 'bodyweight' }),
      ex({ id: 'band1', pattern: 'horizontal_push', equipment: 'band' }),
      ex({ id: 'bw2', pattern: 'horizontal_pull', equipment: 'bodyweight' }),
      ex({ id: 'band2', pattern: 'horizontal_pull', equipment: 'band' }),
      ex({ id: 'bw3', pattern: 'vertical_push', equipment: 'bodyweight' }),
      ex({ id: 'band3', pattern: 'vertical_push', equipment: 'band' }),
      ex({ id: 'bw4', pattern: 'vertical_pull', equipment: 'bodyweight' }),
      ex({ id: 'band4', pattern: 'vertical_pull', equipment: 'band' }),
    ];
    const result = selectMain({
      slots,
      pool,
      poolIgnoringEquipment: pool,
      userState: userState(),
      today: TODAY,
      rng: rng(),
      focus: 'upper',
      equipmentPreference: 'any',
    });
    const bandCount = result.picks.filter((p) => p.exercise.equipment === 'band').length;
    expect(bandCount / result.picks.length).toBeGreaterThanOrEqual(0.5);
  });

  it('favorites are capped at roughly 40% of the session', () => {
    const slots = [
      slot('s1', 'horizontal_push'),
      slot('s2', 'horizontal_pull'),
      slot('s3', 'vertical_push'),
    ];
    const pool = [
      ex({ id: 'fav1', pattern: 'horizontal_push' }),
      ex({ id: 'ok1', pattern: 'horizontal_push' }),
      ex({ id: 'fav2', pattern: 'horizontal_pull' }),
      ex({ id: 'ok2', pattern: 'horizontal_pull' }),
      ex({ id: 'fav3', pattern: 'vertical_push' }),
      ex({ id: 'ok3', pattern: 'vertical_push' }),
    ];
    const result = selectMain({
      slots,
      pool,
      poolIgnoringEquipment: pool,
      userState: userState({
        exerciseStates: {
          fav1: state({ exerciseId: 'fav1', enjoymentEma: 5 }),
          fav2: state({ exerciseId: 'fav2', enjoymentEma: 5 }),
          fav3: state({ exerciseId: 'fav3', enjoymentEma: 5 }),
        },
      }),
      today: TODAY,
      rng: rng(),
      focus: 'upper',
      equipmentPreference: 'any',
    });
    const favCount = result.picks.filter((p) => p.candidate.enjoyment >= 4).length;
    expect(favCount / result.picks.length).toBeLessThanOrEqual(0.5); // ~40% cap, generous bound for a 3-slot session
  });

  it('PATTERN GAP is never silent — bodyweight-only upper uses a band for pulling when one is available', () => {
    const push = ex({ id: 'bw-push', pattern: 'horizontal_push', equipment: 'bodyweight' });
    const bandPull = ex({ id: 'band-pull', pattern: 'horizontal_pull', equipment: 'band' });
    const result = selectMain({
      slots: [slot('s1', 'horizontal_push'), slot('s2', 'horizontal_pull')],
      pool: [push], // bodyweight-filtered pool has no pull option
      poolIgnoringEquipment: [push, bandPull],
      userState: userState(),
      today: TODAY,
      rng: rng(),
      focus: 'upper',
      equipmentPreference: 'bodyweight',
    });
    expect(result.patternGaps).toEqual([{ pattern: 'horizontal_pull', resolution: 'used_band' }]);
    expect(result.picks.some((p) => p.exercise.id === 'band-pull')).toBe(true);
  });

  it('PATTERN GAP is never silent — states the imbalance plainly when no band exists either', () => {
    const push = ex({ id: 'bw-push-2', pattern: 'horizontal_push', equipment: 'bodyweight' });
    const result = selectMain({
      slots: [slot('s1', 'horizontal_push'), slot('s2', 'horizontal_pull')],
      pool: [push],
      poolIgnoringEquipment: [push], // no pull exercise exists at all, even ignoring equipment
      userState: userState(),
      today: TODAY,
      rng: rng(),
      focus: 'upper',
      equipmentPreference: 'bodyweight',
    });
    expect(result.patternGaps).toEqual([
      { pattern: 'horizontal_pull', resolution: 'stated_imbalance' },
    ]);
    expect(result.picks.length).toBe(1);
  });
});
