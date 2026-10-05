/**
 * A movement group ("Trail") over time: the store's family performance history turned into what
 * the Trail progress page draws. Pure, like `exerciseProgress.ts` — the caller reads, this derives.
 *
 * - **Best-set series** across every rung, one point per session, `segment` = which exercise ran
 *   (so the line changes colour when the ladder moves onto a new exercise).
 * - **Level-change markers** where the stable `level_id` differs between consecutive sessions
 *   (ids compared, never array indices — invariant 5; the label is the engine's `levelOrdinal`).
 * - **Rung series**: the rung's ordinal at each session, drawn as a step line.
 * - **Units**: a rung change can switch reps <-> seconds. The dominant unit is charted and the
 *   other unit's sessions are *left out*, with the line broken there (`gapBefore`) rather than
 *   mixing units on one axis or plotting a fake zero.
 * - **Never a loss** (invariant 4): the headline compares best against first, like
 *   `progressSummary`; a lighter day later never rewrites it.
 */
import { levelOrdinal } from '@roamfit/engine';
import type { Exercise, ProgressionFamily } from '@roamfit/data';
import type { exerciseCatalogRepo } from '@roamfit/store';
import type { ChartMarker, SeriesPoint } from './chartGeometry';
import { formatLocalDate, unitLabel } from './exerciseProgress';
import type { ProgressUnit } from './exerciseProgress';

type FamilyPerformance = exerciseCatalogRepo.FamilySessionPerformance;

export interface TrailExerciseRow {
  exerciseId: string;
  name: string;
  sessions: number;
  /** "8 reps → 12 reps", "12 reps", or "Logged" when no set carried a number. */
  summary: string;
  /** Segment index this exercise has on the chart (its colour). */
  segment: number;
}

export interface TrailProgress {
  sessions: number;
  firstDate: string | null;
  latestDate: string | null;
  /** The charted unit; null when no session carried a measured set. */
  unit: ProgressUnit | null;
  /** Best set per session in `unit`, oldest first. */
  points: SeriesPoint[];
  /** Exercise name for each entry of `points` (same order). */
  pointExercise: string[];
  markers: ChartMarker[];
  /** Rung ordinal over time (1-based), oldest first. */
  rungPoints: SeriesPoint[];
  exercises: TrailExerciseRow[];
  headline: string;
}

const rungOf = (family: ProgressionFamily, levelId: string | null): number | null => {
  if (!levelId) return null;
  const { n } = levelOrdinal(family, levelId);
  return n >= 1 ? n : null;
};

/** The unit most of the sessions were logged in; reps win a tie (the common case). */
export function dominantUnit(history: readonly FamilyPerformance[]): ProgressUnit | null {
  const reps = history.filter((p) => p.bestReps !== null).length;
  const seconds = history.filter((p) => p.bestSeconds !== null).length;
  if (reps === 0 && seconds === 0) return null;
  return seconds > reps ? 'seconds' : 'reps';
}

export function buildTrailProgress(
  family: ProgressionFamily,
  exercises: readonly Exercise[],
  history: readonly FamilyPerformance[],
): TrailProgress {
  const nameOf = (id: string) => exercises.find((e) => e.id === id)?.name ?? id;
  const unit = dominantUnit(history);
  const valueOf = (p: FamilyPerformance) =>
    unit === 'reps' ? p.bestReps : unit === 'seconds' ? p.bestSeconds : null;

  // Segment index per exercise, in order of first appearance, so a colour belongs to the exercise.
  const segmentOf = new Map<string, number>();
  for (const p of history)
    if (!segmentOf.has(p.exerciseId)) segmentOf.set(p.exerciseId, segmentOf.size);

  const points: SeriesPoint[] = [];
  const pointExercise: string[] = [];
  let skipped = false;
  for (const p of history) {
    const v = valueOf(p);
    if (v === null) {
      if (points.length > 0) skipped = true;
      continue;
    }
    points.push({
      localDate: p.localDate,
      value: v,
      segment: segmentOf.get(p.exerciseId) ?? 0,
      gapBefore: skipped,
    });
    pointExercise.push(nameOf(p.exerciseId));
    skipped = false;
  }

  const markers: ChartMarker[] = [];
  let prevLevel: string | null = null;
  for (const p of history) {
    const level = p.progressionLevelIdAtTime;
    if (level && prevLevel && level !== prevLevel) {
      const n = rungOf(family, level);
      if (n !== null) markers.push({ localDate: p.localDate, label: `L${n}` });
    }
    if (level) prevLevel = level;
  }

  const rungPoints: SeriesPoint[] = [];
  for (const p of history) {
    const n = rungOf(family, p.progressionLevelIdAtTime);
    if (n !== null) rungPoints.push({ localDate: p.localDate, value: n });
  }

  const rows: TrailExerciseRow[] = [];
  for (const [exerciseId, segment] of segmentOf) {
    const mine = history.filter((p) => p.exerciseId === exerciseId);
    const exUnit = dominantUnit(mine);
    const vals = mine
      .map((p) => (exUnit === 'reps' ? p.bestReps : exUnit === 'seconds' ? p.bestSeconds : null))
      .filter((v): v is number => v !== null);
    let summary = 'Logged';
    if (exUnit && vals.length > 0) {
      const first = vals[0];
      const best = Math.max(...vals);
      summary =
        best > first
          ? `${unitLabel(exUnit, first)} → ${unitLabel(exUnit, best)}`
          : unitLabel(exUnit, best);
    }
    rows.push({ exerciseId, name: nameOf(exerciseId), sessions: mine.length, summary, segment });
  }

  const firstDate = history[0]?.localDate ?? null;
  const latestDate = history.length > 0 ? history[history.length - 1].localDate : null;

  return {
    sessions: history.length,
    firstDate,
    latestDate,
    unit,
    points,
    pointExercise,
    markers,
    rungPoints,
    exercises: rows,
    headline: trailHeadline(history.length, firstDate, rungPoints, points),
  };
}

/** Best against first, never latest against first. */
function trailHeadline(
  sessions: number,
  firstDate: string | null,
  rungs: readonly SeriesPoint[],
  points: readonly SeriesPoint[],
): string {
  if (sessions === 0 || !firstDate) {
    return 'No sessions on this trail yet — this is where your history lands.';
  }
  if (sessions === 1) return 'One session on this trail. That is your baseline.';
  const since = formatLocalDate(firstDate);
  if (rungs.length > 0) {
    const first = rungs[0].value;
    const best = Math.max(...rungs.map((r) => r.value));
    if (best > first) return `Rung ${first} → Rung ${best} since ${since}.`;
  }
  if (points.length > 1 && Math.max(...points.map((p) => p.value)) > points[0].value) {
    return `Stronger than your first session on ${since}.`;
  }
  return `${sessions} sessions on this trail. Holding steady.`;
}
