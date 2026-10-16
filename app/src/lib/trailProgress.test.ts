import type { Exercise, ProgressionFamily } from '@roamfit/data';
import type { exerciseCatalogRepo } from '@roamfit/store';
import { buildTrailProgress, dominantUnit } from './trailProgress';

type Perf = exerciseCatalogRepo.FamilySessionPerformance;

// Level ids are deliberately NOT in array order, so a marker computed from indices would be wrong.
const family = {
  id: 'horizontal_push',
  name: 'Horizontal push',
  pattern: 'push',
  levels: [
    { level_id: 'lv_z', exercise_ids: ['wall'], anchor_exercise_id: 'wall' },
    { level_id: 'lv_a', exercise_ids: ['knee'], anchor_exercise_id: 'knee' },
    { level_id: 'lv_m', exercise_ids: ['hold'], anchor_exercise_id: 'hold' },
  ],
} as unknown as ProgressionFamily;

const exercises = [
  { id: 'wall', name: 'Wall push-up', metric: 'reps', equipment: 'bodyweight', band: null },
  { id: 'knee', name: 'Knee push-up', metric: 'reps', equipment: 'bodyweight', band: null },
  { id: 'hold', name: 'Plank hold', metric: 'time', equipment: 'bodyweight', band: null },
  { id: 'band', name: 'Banded press', metric: 'reps', equipment: 'band', band: 'B1-B2' },
] as unknown as Exercise[];

let n = 0;
function perf(o: Partial<Perf> & { localDate: string; exerciseId: string; level: string }): Perf {
  n += 1;
  const { level, ...rest } = o;
  return {
    sessionId: `s${n}`,
    setsCompleted: 3,
    bestReps: null,
    bestSeconds: null,
    totalReps: 0,
    totalSeconds: 0,
    band: null,
    restSec: 60,
    tempoSec: 0,
    progressionLevelIdAtTime: level,
    ...rest,
  };
}

describe('buildTrailProgress', () => {
  it('handles an empty family without inventing anything', () => {
    const t = buildTrailProgress(family, exercises, []);
    expect(t.sessions).toBe(0);
    expect(t.levels).toEqual([]);
    expect(t.currentLevel).toBe(-1);
    expect(t.exercises).toEqual([]);
  });

  it('gives each level its own page, in ladder order, keyed by level id', () => {
    const t = buildTrailProgress(family, exercises, [
      perf({ localDate: '2026-01-01', exerciseId: 'wall', level: 'lv_z', bestReps: 8 }),
      perf({ localDate: '2026-01-08', exerciseId: 'wall', level: 'lv_z', bestReps: 12 }),
      perf({ localDate: '2026-01-15', exerciseId: 'knee', level: 'lv_a', bestReps: 6 }),
      perf({ localDate: '2026-01-22', exerciseId: 'knee', level: 'lv_a', bestReps: 7 }),
    ]);
    // lv_a is the 2nd rung even though its id sorts first alphabetically.
    expect(t.levels.map((l) => [l.levelId, l.n, l.of, l.name, l.sessions])).toEqual([
      ['lv_z', 1, 3, 'Wall push-up', 2],
      ['lv_a', 2, 3, 'Knee push-up', 2],
    ]);
    // The drop from 12 wall push-ups to 6 knee push-ups never shares a graph.
    expect(t.levels[0].bests.map((b) => b.value)).toEqual([12]);
    expect(t.levels[1].bests.map((b) => b.value)).toEqual([7]);
    // One level per graph, so no rung ticks.
    expect(t.levels.flatMap((l) => l.ladder.markers)).toEqual([]);
    expect([t.levels[1].firstDate, t.levels[1].latestDate]).toEqual(['2026-01-15', '2026-01-22']);
    expect(t.exercises.map((e) => [e.name, e.sessions, e.summary])).toEqual([
      ['Wall push-up', 2, '8 reps → 12 reps'],
      ['Knee push-up', 2, '6 reps → 7 reps'],
    ]);
  });

  it('opens on the level of the latest session, even after a level-down', () => {
    const t = buildTrailProgress(family, exercises, [
      perf({ localDate: '2026-02-01', exerciseId: 'wall', level: 'lv_z', bestReps: 10 }),
      perf({ localDate: '2026-02-08', exerciseId: 'knee', level: 'lv_a', bestReps: 4 }),
      perf({ localDate: '2026-02-15', exerciseId: 'wall', level: 'lv_z', bestReps: 14 }),
    ]);
    expect(t.levels.map((l) => l.levelId)).toEqual(['lv_z', 'lv_a']);
    expect(t.currentLevel).toBe(0);
    // Both stints at level 1 share its page.
    expect(t.levels[0].bests.map((b) => b.value)).toEqual([14]);
  });

  it('charts each level in its own unit', () => {
    const t = buildTrailProgress(family, exercises, [
      perf({ localDate: '2026-02-01', exerciseId: 'knee', level: 'lv_a', bestReps: 10 }),
      perf({ localDate: '2026-02-15', exerciseId: 'hold', level: 'lv_m', bestSeconds: 30 }),
      perf({ localDate: '2026-02-22', exerciseId: 'hold', level: 'lv_m', bestSeconds: 40 }),
    ]);
    expect(t.levels.map((l) => l.unit)).toEqual(['reps', 'seconds']);
    expect(t.levels[1].bests.map((b) => b.value)).toEqual([40]);
    expect(t.exercises.find((e) => e.exerciseId === 'hold')?.summary).toBe('30s → 40s');
  });

  it('dominantUnit prefers reps on a tie and seconds when they are the majority', () => {
    const r = perf({ localDate: '2026-03-01', exerciseId: 'knee', level: 'lv_a', bestReps: 1 });
    const sec = perf({
      localDate: '2026-03-02',
      exerciseId: 'hold',
      level: 'lv_m',
      bestSeconds: 1,
    });
    expect(dominantUnit([r, sec])).toBe('reps');
    expect(dominantUnit([r, sec, sec])).toBe('seconds');
    expect(dominantUnit([])).toBeNull();
  });

  it('places entries that predate level tracking by level membership', () => {
    const t = buildTrailProgress(family, exercises, [
      perf({ localDate: '2026-05-01', exerciseId: 'wall', level: null as never, bestReps: 5 }),
      perf({ localDate: '2026-05-08', exerciseId: 'wall', level: 'lv_z', bestReps: 6 }),
      // 'band' belongs to no level: off the charts, still on the exercise list.
      perf({ localDate: '2026-05-09', exerciseId: 'band', level: null as never, bestReps: 9 }),
    ]);
    expect(t.levels).toHaveLength(1);
    expect(t.levels[0].bests.map((b) => b.value)).toEqual([6]);
    expect(t.currentLevel).toBe(0);
    expect(t.exercises.map((e) => e.exerciseId)).toEqual(['wall', 'band']);
  });

  it('Progress counts steps up this rung: a band step-up with fewer reps still rises', () => {
    const bandFamily = {
      id: 'horizontal_push',
      name: 'Horizontal push',
      pattern: 'push',
      levels: [
        { level_id: 'lv_w', exercise_ids: ['wall'], anchor_exercise_id: 'wall' },
        { level_id: 'lv_b', exercise_ids: ['band'], anchor_exercise_id: 'band' },
      ],
    } as unknown as ProgressionFamily;
    const t = buildTrailProgress(bandFamily, exercises, [
      perf({ localDate: '2026-04-01', exerciseId: 'wall', level: 'lv_w', bestReps: 12 }),
      perf({
        localDate: '2026-04-08',
        exerciseId: 'band',
        level: 'lv_b',
        bestReps: 12,
        band: 'B1',
        tempoSec: 3,
        restSec: 45,
      }),
      perf({
        localDate: '2026-04-15',
        exerciseId: 'band',
        level: 'lv_b',
        bestReps: 8,
        band: 'B2',
        tempoSec: 3,
        restSec: 45,
      }),
    ]);
    const page = t.levels[t.currentLevel];
    expect(page.levelId).toBe('lv_b');
    // Best set is the top set at the heaviest band (8 @ B2), not the larger 12 @ B1 ...
    expect(page.bests).toMatchObject([{ exerciseId: 'band', value: 8, band: 'B2' }]);
    // ... and Progress goes up, counted from this rung's floor rather than the whole ladder.
    expect(page.ladder.points.map((p) => p.value)).toEqual([4, 5]);
    expect(page.ladder.labels[1]).toBe('Rung 2 · B2 × 8 reps · 3 sets');
  });
});
