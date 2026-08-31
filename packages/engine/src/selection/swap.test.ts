import type { Exercise } from '@roamfit/data';
import { alternativesForSlot, buildSwapReplacementEntry } from './swap';
import type { ExerciseState, SessionEntry, SessionHistoryRecord } from '../types';

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
    band: overrides.equipment === 'bodyweight' ? null : (overrides.band ?? 'B1-B3'),
    anchor: overrides.anchor ?? 'anchor-mid',
    anchor_class: overrides.anchor_class ?? 'band_tension',
    unilateral: false,
    metric: overrides.metric ?? 'reps',
    default_seconds: overrides.metric === 'time' ? (overrides.default_seconds ?? 30) : null,
    tier: overrides.tier ?? 'core',
    role: overrides.role ?? 'main',
    difficulty: overrides.difficulty ?? 'medium',
    progression_family: overrides.progression_family ?? null,
    progression_level_id: overrides.progression_level_id ?? null,
    contraindications: overrides.contraindications ?? [],
    setup: 'setup',
    video_search: 'https://example.com',
    demo_media: { type: 'figure', id: overrides.id ?? `ex-${counter}` },
    ...overrides,
  };
}

function entry(overrides: Partial<SessionEntry> = {}): SessionEntry {
  return {
    exerciseId: 'original',
    role: 'main',
    band: 'B2',
    sets: 3,
    repTarget: 12,
    restSec: 45,
    tempoSec: 3,
    effort: 'normal',
    progressionFamilyId: null,
    progressionLevelIdAtTime: null,
    pattern: 'horizontal_push',
    anchorClass: 'band_tension',
    unilateral: false,
    estimatedSec: 200,
    ...overrides,
  };
}

function exState(overrides: Partial<ExerciseState> = {}): ExerciseState {
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

describe('§10.6 alternativesForSlot', () => {
  const original = ex({ id: 'original', pattern: 'horizontal_push', difficulty: 'medium' });
  const samePatternA = ex({ id: 'alt-a', pattern: 'horizontal_push', difficulty: 'medium' });
  const samePatternB = ex({ id: 'alt-b', pattern: 'horizontal_push', difficulty: 'easy' });
  const samePatternC = ex({ id: 'alt-c', pattern: 'horizontal_push', difficulty: 'hard' });
  const samePatternD = ex({ id: 'alt-d', pattern: 'horizontal_push', difficulty: 'medium' });
  const differentPattern = ex({ id: 'other-pattern', pattern: 'squat', difficulty: 'medium' });
  const bodyweightBearing = ex({
    id: 'bw-bearing',
    pattern: 'horizontal_push',
    anchor: 'pullup-bar',
    anchor_class: 'bodyweight_bearing',
    equipment: 'bodyweight',
    difficulty: 'medium',
  });
  const injuredOut = ex({
    id: 'injured',
    pattern: 'horizontal_push',
    contraindications: ['shoulder_horizontal'],
    difficulty: 'medium',
  });
  const wrongAnchor = ex({
    id: 'wrong-anchor',
    pattern: 'horizontal_push',
    anchor: 'anchor-high',
    difficulty: 'medium',
  });

  const library = [
    original,
    samePatternA,
    samePatternB,
    samePatternC,
    samePatternD,
    differentPattern,
    bodyweightBearing,
    injuredOut,
    wrongAnchor,
  ];

  const baseReq = {
    library,
    entry: entry({ exerciseId: 'original', pattern: 'horizontal_push' }),
    anchorsAvailable: ['anchor-mid', 'anchor-high', 'none', 'stance'] as const,
    limitations: [],
    today: '2026-08-31',
    history: [] as SessionHistoryRecord[],
    exerciseStates: {},
  };

  it('only offers exercises filling the same pattern slot', () => {
    const alts = alternativesForSlot(baseReq);
    expect(alts.every((a) => a.exercise.pattern === 'horizontal_push')).toBe(true);
    expect(alts.some((a) => a.exercise.id === 'other-pattern')).toBe(false);
  });

  it('never offers the exercise being replaced', () => {
    const alts = alternativesForSlot(baseReq);
    expect(alts.some((a) => a.exercise.id === 'original')).toBe(false);
  });

  it('respects the §13.2 injury hard filter', () => {
    const alts = alternativesForSlot({
      ...baseReq,
      limitations: [
        { tag: 'shoulder_horizontal', createdAt: '2026-01-01', source: 'user' as const },
      ],
    });
    expect(alts.some((a) => a.exercise.id === 'injured')).toBe(false);
  });

  it('respects §5.3 anchor availability (excludes bodyweight-bearing when not enabled)', () => {
    const alts = alternativesForSlot(baseReq); // anchorsAvailable has no 'pullup-bar'
    expect(alts.some((a) => a.exercise.id === 'bw-bearing')).toBe(false);
  });

  it('offers bodyweight-bearing alternatives once the user enables that anchor, capped at normal effort', () => {
    const alts = alternativesForSlot({
      ...baseReq,
      anchorsAvailable: ['anchor-mid', 'anchor-high', 'pullup-bar', 'none'],
      entry: entry({ exerciseId: 'original', pattern: 'horizontal_push', effort: 'hard' }),
    });
    const bw = alts.find((a) => a.exercise.id === 'bw-bearing');
    expect(bw).toBeDefined();
    expect(bw!.replacement.effort).toBe('normal'); // §13.1 cap
  });

  it('"different anchor" quick-filter excludes the named anchor', () => {
    const alts = alternativesForSlot({ ...baseReq, excludeAnchor: 'anchor-mid' });
    expect(alts.some((a) => a.exercise.anchor === 'anchor-mid')).toBe(false);
    expect(alts.some((a) => a.exercise.id === 'wrong-anchor')).toBe(true);
  });

  it('ranks same-difficulty alternatives ahead of easier/harder ones', () => {
    const alts = alternativesForSlot({ ...baseReq, maxResults: 20 });
    const ids = alts.map((a) => a.exercise.id);
    const idxA = ids.indexOf('alt-a'); // medium, same as original
    const idxB = ids.indexOf('alt-b'); // easy
    const idxC = ids.indexOf('alt-c'); // hard
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxA).toBeLessThan(idxB);
    expect(idxA).toBeLessThan(idxC);
  });

  it('returns at most maxResults (default 5) and never more than 3-5 per §10.6', () => {
    const alts = alternativesForSlot(baseReq);
    expect(alts.length).toBeLessThanOrEqual(5);
  });

  it('excludes REPEATEDLY-SKIPPED-suppressed exercises', () => {
    const alts = alternativesForSlot({
      ...baseReq,
      exerciseStates: {
        'alt-a': exState({ exerciseId: 'alt-a', suppressedUntil: '2099-01-01' }),
      },
    });
    expect(alts.some((a) => a.exercise.id === 'alt-a')).toBe(false);
  });

  it('is deterministic — same input, same output order', () => {
    const first = alternativesForSlot(baseReq).map((a) => a.exercise.id);
    const second = alternativesForSlot(baseReq).map((a) => a.exercise.id);
    expect(first).toEqual(second);
  });
});

describe('§10.6 buildSwapReplacementEntry', () => {
  it('preserves the slot shape (sets, rest, tempo) from the replaced entry', () => {
    const newExercise = ex({ id: 'new-one', band: 'B1-B4' });
    const replaced = entry({ sets: 4, restSec: 60, tempoSec: 2, band: 'B3', repTarget: 10 });
    const result = buildSwapReplacementEntry(newExercise, replaced);
    expect(result.sets).toBe(4);
    expect(result.restSec).toBe(60);
    expect(result.tempoSec).toBe(2);
    expect(result.exerciseId).toBe('new-one');
  });

  it('records what the swap replaced via substitutedFor', () => {
    const newExercise = ex({ id: 'new-one' });
    const replaced = entry({ exerciseId: 'old-one' });
    const result = buildSwapReplacementEntry(newExercise, replaced);
    expect(result.substitutedFor).toBe('old-one');
  });

  it('re-prescribes for a timed exercise even if the replaced entry was rep-based', () => {
    const timedExercise = ex({ id: 'timed-one', metric: 'time', default_seconds: 40 });
    const replaced = entry({ repTarget: 12, durationSec: undefined });
    const result = buildSwapReplacementEntry(timedExercise, replaced);
    expect(result.durationSec).toBe(40);
    expect(result.repTarget).toBeUndefined();
  });

  it("clamps the band into the new exercise's own suggested range", () => {
    const lightExercise = ex({ id: 'light', band: 'B1-B2' });
    const replaced = entry({ band: 'B5' });
    const result = buildSwapReplacementEntry(lightExercise, replaced);
    expect(result.band).toBe('B2');
  });
});
