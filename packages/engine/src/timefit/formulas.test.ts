import {
  cooldownMinutes,
  mainBudgetSec,
  mainExerciseCountRange,
  repExerciseSec,
  timedExerciseSec,
  warmupMinutes,
} from './formulas';

describe('§5.6 time budget formulas', () => {
  it('warmup/cooldown minutes clamp as specified', () => {
    expect(warmupMinutes(30)).toBe(4); // round(0.12*30)=4, within [3,8]
    expect(cooldownMinutes(30)).toBe(3); // round(0.1*30)=3
    expect(warmupMinutes(5)).toBe(3); // clamped up
    expect(warmupMinutes(90)).toBe(8); // clamped down
  });

  it('per-exercise transition buffer accounts for real setup time between exercises', () => {
    // warm-up 4, cool-down 3, main budget 1380s; each exercise 3 x (11reps x 3s + 45s rest) + 120
    expect(warmupMinutes(30)).toBe(4);
    expect(cooldownMinutes(30)).toBe(3);
    expect(mainBudgetSec(30)).toBe(1380);
    const perExercise = repExerciseSec({
      sets: 3,
      reps: 11,
      tempoSec: 3,
      restSec: 45,
      unilateral: false,
    });
    expect(perExercise).toBe(354);
    const count = Math.floor(1380 / 354);
    expect(count).toBe(3);
    const totalMin = 4 + 3 + Math.round((count * 354) / 60);
    expect(totalMin).toBe(25);
  });

  it('unilateral doubles the work seconds', () => {
    const bilateral = repExerciseSec({
      sets: 3,
      reps: 10,
      tempoSec: 3,
      restSec: 45,
      unilateral: false,
    });
    const unilateral = repExerciseSec({
      sets: 3,
      reps: 10,
      tempoSec: 3,
      restSec: 45,
      unilateral: true,
    });
    expect(unilateral).toBeGreaterThan(bilateral);
    expect(unilateral - bilateral).toBe(3 * 10 * 3); // extra work_sec per set, x3 sets
  });

  it('anchor rebuild adds 180s instead of 120s', () => {
    const normal = repExerciseSec({
      sets: 3,
      reps: 10,
      tempoSec: 3,
      restSec: 45,
      unilateral: false,
    });
    const rebuild = repExerciseSec({
      sets: 3,
      reps: 10,
      tempoSec: 3,
      restSec: 45,
      unilateral: false,
      anchorRebuild: true,
    });
    expect(rebuild - normal).toBe(60);
  });

  it('timed exercise formula matches §5.6', () => {
    const sec = timedExerciseSec({ sets: 3, durationSec: 30, restSec: 45, unilateral: false });
    expect(sec).toBe(3 * (30 + 45) + 120);
  });

  it('exercise-count sanity check matches the §5.6 table', () => {
    expect(mainExerciseCountRange(15)).toEqual([3, 4]);
    expect(mainExerciseCountRange(20)).toEqual([4, 5]);
    expect(mainExerciseCountRange(30)).toEqual([5, 6]);
    expect(mainExerciseCountRange(45)).toEqual([7, 8]);
    expect(mainExerciseCountRange(60)).toEqual([8, 10]);
  });
});
