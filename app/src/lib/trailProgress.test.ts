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
    expect(t.unit).toBeNull();
    expect(t.points).toEqual([]);
    expect(t.markers).toEqual([]);
    expect(t.exercises).toEqual([]);
  });

  it('segments the best-set series by exercise, in order of first appearance', () => {
    const t = buildTrailProgress(family, exercises, [
      perf({ localDate: '2026-01-01', exerciseId: 'wall', level: 'lv_z', bestReps: 8 }),
      perf({ localDate: '2026-01-08', exerciseId: 'wall', level: 'lv_z', bestReps: 12 }),
      perf({ localDate: '2026-01-15', exerciseId: 'knee', level: 'lv_a', bestReps: 6 }),
    ]);
    expect(t.points.map((p) => p.segment)).toEqual([0, 0, 1]);
    expect(t.legend).toEqual([
      { label: 'Wall push-up', segment: 0 },
      { label: 'Knee push-up', segment: 1 },
    ]);
    expect(t.pointExercise).toEqual(['Wall push-up', 'Wall push-up', 'Knee push-up']);
    expect(t.exercises.map((e) => [e.name, e.sessions, e.summary])).toEqual([
      ['Wall push-up', 2, '8 reps → 12 reps'],
      ['Knee push-up', 1, '6 reps'],
    ]);
  });

  it('marks a level change by comparing level ids, labelled with the engine ordinal', () => {
    const t = buildTrailProgress(family, exercises, [
      perf({ localDate: '2026-01-01', exerciseId: 'wall', level: 'lv_z', bestReps: 8 }),
      perf({ localDate: '2026-01-08', exerciseId: 'wall', level: 'lv_z', bestReps: 12 }),
      perf({ localDate: '2026-01-15', exerciseId: 'knee', level: 'lv_a', bestReps: 6 }),
      perf({ localDate: '2026-01-22', exerciseId: 'knee', level: 'lv_a', bestReps: 7 }),
    ]);
    // lv_a is the 2nd rung even though its id sorts first alphabetically.
    expect(t.markers).toEqual([{ localDate: '2026-01-15', label: 'L2', kind: 'rung' }]);
  });

  it('charts the dominant unit and leaves other-unit sessions as gaps', () => {
    const history = [
      perf({ localDate: '2026-02-01', exerciseId: 'knee', level: 'lv_a', bestReps: 10 }),
      perf({ localDate: '2026-02-08', exerciseId: 'knee', level: 'lv_a', bestReps: 12 }),
      perf({ localDate: '2026-02-15', exerciseId: 'hold', level: 'lv_m', bestSeconds: 30 }),
      perf({ localDate: '2026-02-22', exerciseId: 'knee', level: 'lv_a', bestReps: 14 }),
    ];
    expect(dominantUnit(history)).toBe('reps');
    const t = buildTrailProgress(family, exercises, history);
    expect(t.unit).toBe('reps');
    // The 30s hold is not plotted as a rep count, and the line breaks across it.
    expect(t.points.map((p) => p.value)).toEqual([10, 12, 14]);
    expect(t.points.map((p) => p.gapBefore)).toEqual([false, false, true]);
    // The hold is still on the list, in its own unit, and still moves the rung series.
    expect(t.exercises.find((e) => e.exerciseId === 'hold')?.summary).toBe('30s');
  });

  it('charts seconds when a hold-based trail is mostly seconds', () => {
    const t = buildTrailProgress(family, exercises, [
      perf({ localDate: '2026-03-01', exerciseId: 'hold', level: 'lv_m', bestSeconds: 20 }),
      perf({ localDate: '2026-03-08', exerciseId: 'hold', level: 'lv_m', bestSeconds: 30 }),
    ]);
    expect(t.unit).toBe('seconds');
    expect(t.points.map((p) => p.value)).toEqual([20, 30]);
  });

  it('copes with entries that predate level tracking (null level id)', () => {
    const t = buildTrailProgress(family, exercises, [
      perf({ localDate: '2026-05-01', exerciseId: 'wall', level: null as never, bestReps: 5 }),
      perf({ localDate: '2026-05-08', exerciseId: 'wall', level: 'lv_z', bestReps: 5 }),
    ]);
    expect(t.markers).toEqual([]);
  });

  it('puts a band step-up with fewer reps higher on the Progress ladder and breaks Best set there', () => {
    const bandFamily = {
      id: 'horizontal_push',
      name: 'Horizontal push',
      pattern: 'push',
      levels: [{ level_id: 'lv_b', exercise_ids: ['band'], anchor_exercise_id: 'band' }],
    } as unknown as ProgressionFamily;
    const t = buildTrailProgress(bandFamily, exercises, [
      perf({
        localDate: '2026-04-01',
        exerciseId: 'band',
        level: 'lv_b',
        bestReps: 12,
        band: 'B1',
        tempoSec: 3,
        restSec: 45,
      }),
      perf({
        localDate: '2026-04-08',
        exerciseId: 'band',
        level: 'lv_b',
        bestReps: 8,
        band: 'B2',
        tempoSec: 3,
        restSec: 45,
      }),
    ]);
    // Best set drops 12 -> 8 but is a new run labelled B2 ...
    expect(t.points.map((p) => [p.value, p.segment])).toEqual([
      [12, 0],
      [8, 1],
    ]);
    expect(t.markers).toEqual([{ localDate: '2026-04-08', label: 'B2', kind: 'band' }]);
    expect(t.pointBand).toEqual(['B1', 'B2']);
    // ... while Progress goes up.
    expect(t.ladder.points.map((p) => p.value)).toEqual([4, 5]);
    expect(t.ladder.labels[1]).toBe('Rung 1 · B2 × 8 reps · 3 sets');
  });
});
