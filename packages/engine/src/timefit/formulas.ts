/**
 * §5.6 time budget — the pure arithmetic, shared by prescription (per-entry `estimatedSec`) and
 * the time-fit stage (which sums entries against the target and adds/drops until within ±10%).
 */

export function warmupMinutes(targetMinutes: number): number {
  return clamp(Math.round(0.12 * targetMinutes), 3, 8);
}

export function cooldownMinutes(targetMinutes: number): number {
  return clamp(Math.round(0.1 * targetMinutes), 3, 7);
}

export function mainBudgetSec(targetMinutes: number): number {
  return (targetMinutes - warmupMinutes(targetMinutes) - cooldownMinutes(targetMinutes)) * 60;
}

function clamp(n: number, low: number, high: number): number {
  return Math.min(Math.max(n, low), high);
}

/** Straight-set rep-based exercise. `anchorRebuild` adds 45s instead of 30s when the anchor must
 *  be re-set up between exercises (e.g. switching to a different anchor point). */
export function repExerciseSec(params: {
  sets: number;
  reps: number;
  tempoSec: number;
  restSec: number;
  unilateral: boolean;
  anchorRebuild?: boolean;
}): number {
  const workSec = params.reps * params.tempoSec * (params.unilateral ? 2 : 1);
  const setSec = workSec + params.restSec;
  return params.sets * setSec + (params.anchorRebuild ? 45 : 30);
}

/** Timed exercise (§5.6: `sets × (duration_sec + rest_sec) + 30`, ×2 if unilateral). */
export function timedExerciseSec(params: {
  sets: number;
  durationSec: number;
  restSec: number;
  unilateral: boolean;
  anchorRebuild?: boolean;
}): number {
  const perSet = params.durationSec + params.restSec;
  const base = params.sets * perSet * (params.unilateral ? 2 : 1);
  return base + (params.anchorRebuild ? 45 : 30);
}

/** §5.6 exercise-count sanity check: [min, max] main exercises for a target length. */
export function mainExerciseCountRange(targetMinutes: number): [number, number] {
  if (targetMinutes <= 15) return [3, 4];
  if (targetMinutes <= 20) return [4, 5];
  if (targetMinutes <= 30) return [5, 6];
  if (targetMinutes <= 45) return [7, 8];
  return [8, 10];
}
