import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import type { exerciseCatalogRepo } from '@roamfit/store';
import {
  bestSetLabel,
  buildBestSetSeries,
  buildBestSetStats,
  buildExerciseBestSeries,
  buildExerciseLadder,
  buildLadderSeries,
  ladderLabel,
  rungMarkers,
} from './ladderSeries';
import type { SeriesSession } from './ladderSeries';

const library = exerciseLibrary.exercises;
const push = familyLibrary.families.find((f) => f.id === 'horizontal_push')!;
// l5 = banded-push-up (B1-B2, 13 steps), floor at position 32; l4 = bw-push-up.
const banded = library.find((e) => e.id === 'banded-push-up')!;

function sess(o: Partial<SeriesSession> & { localDate: string }): SeriesSession {
  return {
    exerciseId: 'banded-push-up',
    exerciseName: 'Banded push-up',
    levelId: 'horizontal_push.l5',
    bestReps: 8,
    bestSeconds: null,
    band: 'B1',
    tempoSec: 3,
    restSec: 45,
    setsCompleted: 3,
    ...o,
  };
}

describe('buildLadderSeries (Progress)', () => {
  const sessions = [
    sess({ localDate: '2026-01-01', bestReps: 12, band: 'B1' }),
    sess({ localDate: '2026-01-08', bestReps: 8, band: 'B2' }),
  ];

  it('a band step-up with fewer reps rises on Progress', () => {
    const l = buildLadderSeries(push, library, sessions);
    expect(l.points.map((p) => p.value)).toEqual([36, 37]);
    expect(l.labels).toEqual(['Rung 5 · B1 × 12 reps · 3 sets', 'Rung 5 · B2 × 8 reps · 3 sets']);
    expect(l.pointExercise).toEqual(['Banded push-up', 'Banded push-up']);
  });

  it('is one unbroken series: no segment changes with the band', () => {
    const l = buildLadderSeries(push, library, sessions);
    expect(l.points.every((p) => p.segment === undefined && !p.gapBefore)).toBe(true);
  });

  it('leaves unplaceable sessions as gaps and ticks rung changes by level id', () => {
    const l = buildLadderSeries(push, library, [
      sess({ localDate: '2026-02-01', levelId: 'horizontal_push.l5' }),
      sess({ localDate: '2026-02-08', levelId: null }),
      sess({ localDate: '2026-02-15', levelId: 'horizontal_push.l6', band: null, exerciseId: 'x' }),
      sess({ localDate: '2026-02-22', levelId: 'horizontal_push.l404' }),
    ]);
    expect(l.points.map((p) => [p.localDate, p.gapBefore])).toEqual([
      ['2026-02-01', false],
      ['2026-02-15', true],
    ]);
    expect(l.markers).toEqual([{ localDate: '2026-02-15', label: 'L6', kind: 'rung' }]);
  });

  it('is empty when nothing can be placed', () => {
    expect(
      buildLadderSeries(push, library, [sess({ localDate: '2026-01-01', levelId: null })]).points,
    ).toEqual([]);
  });

  it('labels bodyweight with no band and a time metric in seconds', () => {
    expect(ladderLabel(2, null, 'reps', 10, 3)).toBe('Rung 2 · 10 reps · 3 sets');
    expect(ladderLabel(1, null, 'seconds', 30, 1)).toBe('Rung 1 · 30s · 1 set');
    const hang = familyLibrary.families.find((f) => f.id === 'vertical_pull')!;
    const l = buildLadderSeries(hang, library, [
      sess({
        localDate: '2026-03-01',
        levelId: 'vertical_pull.l1',
        exerciseId: 'bw-dead-hang',
        bestReps: null,
        bestSeconds: 25,
        band: null,
      }),
    ]);
    expect(l.labels).toEqual(['Rung 1 · 25s · 3 sets']);
  });
});

describe('buildBestSetSeries (band-aware)', () => {
  const sessions = [
    sess({ localDate: '2026-01-01', bestReps: 12, band: 'B1' }),
    sess({ localDate: '2026-01-08', bestReps: 10, band: 'B1' }),
    sess({ localDate: '2026-01-15', bestReps: 8, band: 'B2' }),
    sess({ localDate: '2026-01-22', bestReps: 9, band: 'B2' }),
  ];

  it('starts a new segment (colour) when the band changes, and ticks it with the band', () => {
    const b = buildBestSetSeries(sessions, 'reps');
    expect(b.points.map((p) => p.segment)).toEqual([0, 0, 1, 1]);
    expect(b.markers).toEqual([{ localDate: '2026-01-15', label: 'B2', kind: 'band' }]);
    expect(b.pointBand).toEqual(['B1', 'B1', 'B2', 'B2']);
    expect(b.legend).toEqual([
      { label: 'Banded push-up · B1', segment: 0 },
      { label: 'Banded push-up · B2', segment: 1 },
    ]);
  });

  it('a lighter band later is a tick too, and reuses the earlier colour', () => {
    const b = buildBestSetSeries(
      [...sessions, sess({ localDate: '2026-02-01', bestReps: 12, band: 'B1' })],
      'reps',
    );
    expect(b.markers.map((m) => m.label)).toEqual(['B2', 'B1']);
    expect(b.points[4].segment).toBe(0);
  });

  it('bodyweight sessions carry no band, no band tick and no band in the legend', () => {
    const b = buildBestSetSeries(
      [
        sess({ localDate: '2026-01-01', band: null, exerciseId: 'bw', exerciseName: 'Push-up' }),
        sess({ localDate: '2026-01-08', band: null, exerciseId: 'bw', exerciseName: 'Push-up' }),
      ],
      'reps',
    );
    expect(b.markers).toEqual([]);
    expect(b.legend).toEqual([{ label: 'Push-up', segment: 0 }]);
    expect(bestSetLabel('reps', 8, null)).toBe('8 reps');
    expect(bestSetLabel('reps', 8, 'B3')).toBe('8 reps @ B3');
    expect(bestSetLabel('seconds', 30, 'B1')).toBe('30s @ B1');
  });

  it('an exercise change gets its own colour but no band tick; rung ticks come with a family', () => {
    const b = buildBestSetSeries(
      [
        sess({
          localDate: '2026-01-01',
          levelId: 'horizontal_push.l4',
          band: null,
          exerciseId: 'bw',
        }),
        sess({ localDate: '2026-01-08', levelId: 'horizontal_push.l5', band: 'B1' }),
        sess({ localDate: '2026-01-15', levelId: 'horizontal_push.l5', band: 'B2' }),
      ],
      'reps',
      push,
    );
    expect(b.markers).toEqual([
      { localDate: '2026-01-08', label: 'L5', kind: 'rung' },
      { localDate: '2026-01-15', label: 'B2', kind: 'band' },
    ]);
    expect(b.points.map((p) => p.segment)).toEqual([0, 1, 2]);
  });

  it('breaks the line across a session with nothing in the charted unit', () => {
    const b = buildBestSetSeries(
      [
        sess({ localDate: '2026-01-01' }),
        sess({ localDate: '2026-01-08', bestReps: null, bestSeconds: 30 }),
        sess({ localDate: '2026-01-15' }),
      ],
      'reps',
    );
    expect(b.points.map((p) => p.gapBefore)).toEqual([false, true]);
  });

  it('is empty without a unit', () => {
    expect(buildBestSetSeries(sessions, null).points).toEqual([]);
  });
});

describe('buildBestSetStats', () => {
  it('takes the top reps at the heaviest band, not the biggest number overall', () => {
    const stats = buildBestSetStats(
      [
        sess({ localDate: '2026-01-01', bestReps: 15, band: 'B1' }),
        sess({ localDate: '2026-01-08', bestReps: 6, band: 'B3' }),
        sess({ localDate: '2026-01-15', bestReps: 8, band: 'B3' }),
        sess({ localDate: '2026-01-22', bestReps: 20, band: 'B2' }),
      ],
      'reps',
    );
    expect(stats).toEqual([
      { exerciseId: 'banded-push-up', name: 'Banded push-up', value: 8, band: 'B3' },
    ]);
  });

  it('one stat per exercise in order of first appearance; bodyweight has no band', () => {
    const stats = buildBestSetStats(
      [
        sess({
          localDate: '2026-01-01',
          exerciseId: 'bw',
          exerciseName: 'Push-up',
          band: null,
          bestReps: 9,
        }),
        sess({ localDate: '2026-01-08', bestReps: 5, band: 'B2' }),
        sess({
          localDate: '2026-01-15',
          exerciseId: 'bw',
          exerciseName: 'Push-up',
          band: null,
          bestReps: 11,
        }),
      ],
      'reps',
    );
    expect(stats.map((s) => [s.name, s.value, s.band])).toEqual([
      ['Push-up', 11, null],
      ['Banded push-up', 5, 'B2'],
    ]);
  });

  it('a banded session outranks bodyweight; timed sets use seconds; unmeasured sessions are skipped', () => {
    const mixed = [
      sess({ localDate: '2026-01-01', band: null, bestReps: 30 }),
      sess({ localDate: '2026-01-08', band: 'B1', bestReps: 10 }),
    ];
    expect(buildBestSetStats(mixed, 'reps')[0]).toMatchObject({ value: 10, band: 'B1' });
    const timed = buildBestSetStats(
      [
        sess({ localDate: '2026-01-01', bestReps: null, bestSeconds: 30 }),
        sess({ localDate: '2026-01-08', bestReps: 8, bestSeconds: null }),
        sess({ localDate: '2026-01-15', bestReps: null, bestSeconds: 45 }),
      ],
      'seconds',
    );
    expect(timed).toEqual([
      { exerciseId: 'banded-push-up', name: 'Banded push-up', value: 45, band: 'B1' },
    ]);
    expect(buildBestSetStats(mixed, null)).toEqual([]);
  });
});

describe('rungMarkers', () => {
  it('compares level ids, not positions', () => {
    expect(
      rungMarkers(push, [
        sess({ localDate: '2026-01-01', levelId: 'horizontal_push.l2' }),
        sess({ localDate: '2026-01-08', levelId: 'horizontal_push.l2' }),
        sess({ localDate: '2026-01-15', levelId: 'horizontal_push.l3' }),
      ]),
    ).toEqual([{ localDate: '2026-01-15', label: 'L3', kind: 'rung' }]);
  });
});

type H = exerciseCatalogRepo.ExerciseHistoryPerformance;
const hist = (o: Partial<H> & { localDate: string }): H => ({
  sessionId: o.localDate,
  setsCompleted: 3,
  bestReps: 8,
  bestSeconds: null,
  totalReps: 24,
  totalSeconds: 0,
  band: 'B1',
  restSec: 45,
  tempoSec: 3,
  progressionFamilyId: 'horizontal_push',
  progressionLevelIdAtTime: 'horizontal_push.l5',
  ...o,
});

describe('exercise detail series', () => {
  it('Progress places this exercise on its own family ladder', () => {
    const l = buildExerciseLadder(
      [
        hist({ localDate: '2026-01-01', bestReps: 12 }),
        hist({ localDate: '2026-01-08', band: 'B2' }),
      ],
      banded,
      familyLibrary.families,
      library,
    );
    expect(l?.points.map((p) => p.value)).toEqual([36, 37]);
  });

  it('is null for an exercise off any ladder (warm-ups), or with nothing placeable', () => {
    const warmup = library.find((e) => !e.progression_family)!;
    expect(
      buildExerciseLadder(
        [hist({ localDate: '2026-01-01' })],
        warmup,
        familyLibrary.families,
        library,
      ),
    ).toBeNull();
    expect(
      buildExerciseLadder(
        [
          hist({
            localDate: '2026-01-01',
            progressionFamilyId: null,
            progressionLevelIdAtTime: null,
          }),
        ],
        banded,
        familyLibrary.families,
        library,
      ),
    ).toBeNull();
  });

  it('a session recorded under another family is a gap, not placed on this ladder', () => {
    const l = buildExerciseLadder(
      [
        hist({ localDate: '2026-01-01' }),
        hist({
          localDate: '2026-01-08',
          progressionFamilyId: 'squat',
          progressionLevelIdAtTime: 'squat.l1',
        }),
        hist({ localDate: '2026-01-15' }),
      ],
      banded,
      familyLibrary.families,
      library,
    );
    expect(l?.points.map((p) => p.gapBefore)).toEqual([false, true]);
  });

  it('Best set is band-aware for the exercise', () => {
    const b = buildExerciseBestSeries(
      [
        hist({ localDate: '2026-01-01', bestReps: 12 }),
        hist({ localDate: '2026-01-08', bestReps: 8, band: 'B2' }),
      ],
      banded,
      'reps',
    );
    expect(b.points.map((p) => [p.value, p.segment])).toEqual([
      [12, 0],
      [8, 1],
    ]);
    expect(b.markers).toEqual([{ localDate: '2026-01-08', label: 'B2', kind: 'band' }]);
  });
});
