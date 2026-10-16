/**
 * A movement group ("Trail") over time: the store's family performance history turned into the
 * charts drawn on each Trail card on Journey. Pure, like `exerciseProgress.ts` — the caller reads,
 * this derives (`lib/ladderSeries.ts` builds the series).
 *
 * - **One graph per level.** Moving up a rung means a harder exercise, so the best set falls even
 *   though the user progressed; on a shared line that read as a regression whatever tick marked
 *   it. So each level the user has trained gets its own page (`levels`), in ladder order, and the
 *   card opens on the level of the latest session (`currentLevel`) with arrows to the others.
 * - **Progress** (the default per page): steps up this rung (`stepsInRung`), so a band step-up
 *   that costs reps reads as a step forward.
 * - **Best set**: not a graph — one stat per exercise at this level, its top reps/seconds at the
 *   heaviest band it was done with.
 * - Pages are keyed by the stable `level_id` (invariant 5; the "Level 3" number is the engine's
 *   `levelOrdinal`). A level-down and back again puts both stints on one page, with the honest
 *   time gap between them.
 * - A session that predates level tracking (null level id) joins the page of the one level whose
 *   `exercise_ids` holds its exercise; if that is ambiguous it is left off the charts (it is still
 *   counted in the exercise rows).
 * - **Units**: a level's members share one metric, so a page has one unit. Should one page mix
 *   them anyway, its dominant unit is charted and the rest are gaps, never a fake zero.
 */
import { levelOrdinal } from '@roamfit/engine';
import type { Exercise, ProgressionFamily } from '@roamfit/data';
import type { exerciseCatalogRepo } from '@roamfit/store';
import { unitLabel } from './exerciseProgress';
import type { ProgressUnit } from './exerciseProgress';
import { buildBestSetStats, buildLadderSeries } from './ladderSeries';
import type { BestSetStat, LadderSeries, SeriesSession } from './ladderSeries';

type FamilyPerformance = exerciseCatalogRepo.FamilySessionPerformance;

export interface TrailExerciseRow {
  exerciseId: string;
  name: string;
  sessions: number;
  /** "8 reps → 12 reps", "12 reps", or "Logged" when no set carried a number. */
  summary: string;
}

/** One level's own graph. */
export interface TrailLevelPage {
  levelId: string;
  /** The engine's ordinal: "Level `n` of `of`". */
  n: number;
  of: number;
  /** The level's anchor exercise, naming the page. */
  name: string;
  sessions: number;
  firstDate: string;
  latestDate: string;
  /** The Best set chart's unit; null when no session at this level carried a measured set. */
  unit: ProgressUnit | null;
  /** Steps up this rung per session; empty when no session could be placed. */
  ladder: LadderSeries;
  /** Best set per exercise at this level: top reps/seconds at the heaviest band (single values). */
  bests: BestSetStat[];
}

export interface TrailProgress {
  sessions: number;
  firstDate: string | null;
  latestDate: string | null;
  /** One page per level with sessions, easiest → hardest. */
  levels: TrailLevelPage[];
  /** Index into `levels` of the latest session's level (the page the card opens on); -1 if none. */
  currentLevel: number;
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
  const levelOf = (p: FamilyPerformance): string | null => {
    if (p.progressionLevelIdAtTime) {
      return family.levels.some((l) => l.level_id === p.progressionLevelIdAtTime)
        ? p.progressionLevelIdAtTime
        : null;
    }
    const holders = family.levels.filter((l) => l.exercise_ids.includes(p.exerciseId));
    return holders.length === 1 ? holders[0].level_id : null;
  };
  const byLevel = new Map<string, FamilyPerformance[]>();
  let latestLevel: string | null = null;
  for (const p of history) {
    const levelId = levelOf(p);
    if (!levelId) continue;
    const list = byLevel.get(levelId) ?? [];
    list.push(p);
    byLevel.set(levelId, list);
    latestLevel = levelId;
  }

  const levels: TrailLevelPage[] = [];
  for (const level of family.levels) {
    const mine = byLevel.get(level.level_id);
    if (!mine) continue;
    const unit = dominantUnit(mine);
    const sessions: SeriesSession[] = mine.map((p) => ({
      localDate: p.localDate,
      exerciseId: p.exerciseId,
      exerciseName: nameOf(p.exerciseId),
      levelId: level.level_id,
      bestReps: p.bestReps,
      bestSeconds: p.bestSeconds,
      band: p.band,
      tempoSec: p.tempoSec,
      restSec: p.restSec,
      setsCompleted: p.setsCompleted,
    }));
    const { n, of } = levelOrdinal(family, level.level_id);
    levels.push({
      levelId: level.level_id,
      n,
      of,
      name: nameOf(level.anchor_exercise_id),
      sessions: mine.length,
      firstDate: mine[0].localDate,
      latestDate: mine[mine.length - 1].localDate,
      unit,
      ladder: buildLadderSeries(family, exercises, sessions, { withinRung: true }),
      bests: buildBestSetStats(sessions, unit),
    });
  }

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
    levels,
    currentLevel: levels.findIndex((l) => l.levelId === latestLevel),
    exercises: rows,
  };
}
