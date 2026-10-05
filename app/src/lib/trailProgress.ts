/**
 * A movement group ("Trail") over time: the store's family performance history turned into the
 * two charts drawn on each Trail card on Journey. Pure, like `exerciseProgress.ts` — the caller
 * reads, this derives (`lib/ladderSeries.ts` builds the series).
 *
 * - **Progress** (the default): each session's position on the engine's micro ladder, so a band
 *   step-up that costs reps reads as a step forward, with rung ticks.
 * - **Best set**: reps/seconds per session across every rung, band-aware — the line breaks and
 *   changes colour where the band (or exercise) changes, with band ticks beside the rung ticks.
 * - **Level-change markers** where the stable `level_id` differs between consecutive sessions
 *   (ids compared, never array indices — invariant 5; the label is the engine's `levelOrdinal`).
 * - **Units**: a rung change can switch reps <-> seconds. The dominant unit is charted for Best
 *   set and the other unit's sessions are *left out*, with the line broken there (`gapBefore`)
 *   rather than mixing units on one axis or plotting a fake zero.
 */
import type { Exercise, ProgressionFamily } from '@roamfit/data';
import type { exerciseCatalogRepo } from '@roamfit/store';
import type { BandId } from '@roamfit/engine';
import type { ChartMarker, SeriesPoint } from './chartGeometry';
import { unitLabel } from './exerciseProgress';
import type { ProgressUnit } from './exerciseProgress';
import { buildBestSetSeries, buildLadderSeries } from './ladderSeries';
import type { SeriesSession } from './ladderSeries';

type FamilyPerformance = exerciseCatalogRepo.FamilySessionPerformance;

export interface TrailExerciseRow {
  exerciseId: string;
  name: string;
  sessions: number;
  /** "8 reps → 12 reps", "12 reps", or "Logged" when no set carried a number. */
  summary: string;
}

export interface TrailProgress {
  sessions: number;
  firstDate: string | null;
  latestDate: string | null;
  /** The Best set chart's unit; null when no session carried a measured set. */
  unit: ProgressUnit | null;
  /** Best set per session in `unit`, oldest first; `segment` = (exercise, band) colour. */
  points: SeriesPoint[];
  /** Exercise name for each entry of `points` (same order). */
  pointExercise: string[];
  /** Band for each entry of `points` (null for bodyweight work). */
  pointBand: (BandId | null)[];
  /** Rung ticks plus band ticks for the Best set chart. */
  markers: ChartMarker[];
  /** One per segment colour on the Best set chart (the legend). */
  legend: { label: string; segment: number }[];
  /** Ladder-position series for the Progress chart; empty when no session could be placed. */
  ladder: {
    points: SeriesPoint[];
    labels: string[];
    pointExercise: string[];
    markers: ChartMarker[];
  };
  /** One per exercise that has run on this trail, in order of first appearance. */
  exercises: TrailExerciseRow[];
}

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
  const sessions: SeriesSession[] = history.map((p) => ({
    localDate: p.localDate,
    exerciseId: p.exerciseId,
    exerciseName: nameOf(p.exerciseId),
    levelId: p.progressionLevelIdAtTime,
    bestReps: p.bestReps,
    bestSeconds: p.bestSeconds,
    band: p.band,
    tempoSec: p.tempoSec,
    restSec: p.restSec,
    setsCompleted: p.setsCompleted,
  }));
  const best = buildBestSetSeries(sessions, unit, family);
  const ladder = buildLadderSeries(family, exercises, sessions);

  const rows: TrailExerciseRow[] = [];
  const seen = new Set<string>();
  for (const p of history) {
    if (seen.has(p.exerciseId)) continue;
    seen.add(p.exerciseId);
    const mine = history.filter((q) => q.exerciseId === p.exerciseId);
    const exUnit = dominantUnit(mine);
    const vals = mine
      .map((q) => (exUnit === 'reps' ? q.bestReps : exUnit === 'seconds' ? q.bestSeconds : null))
      .filter((v): v is number => v !== null);
    let summary = 'Logged';
    if (exUnit && vals.length > 0) {
      const first = vals[0];
      const top = Math.max(...vals);
      summary =
        top > first
          ? `${unitLabel(exUnit, first)} → ${unitLabel(exUnit, top)}`
          : unitLabel(exUnit, top);
    }
    rows.push({
      exerciseId: p.exerciseId,
      name: nameOf(p.exerciseId),
      sessions: mine.length,
      summary,
    });
  }

  return {
    sessions: history.length,
    firstDate: history[0]?.localDate ?? null,
    latestDate: history.length > 0 ? history[history.length - 1].localDate : null,
    unit,
    points: best.points,
    pointExercise: best.pointExercise,
    pointBand: best.pointBand,
    markers: best.markers,
    legend: best.legend,
    ladder,
    exercises: rows,
  };
}
