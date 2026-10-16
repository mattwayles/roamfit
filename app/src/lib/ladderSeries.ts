/**
 * The two series both the Trail card and the exercise page draw, derived from the store's
 * per-session history. Pure, like `exerciseProgress.ts`.
 *
 * - **Progress** (`buildLadderSeries`): each session's position on the engine's micro ladder
 *   (`ladderPosition`, packages/engine). A band step-up that costs reps is a step FORWARD there, so
 *   this is the chart that reads as progress. Sessions that cannot be placed (no/unknown level id,
 *   nothing measured in the anchor's unit) are left out and the line is broken there (`gapBefore`)
 *   rather than plotted as a zero. It may dip if a session was performed lower — that is honest,
 *   and it is drawn with no decline styling (invariant 4).
 * - **Best set** (`buildBestSetSeries`): reps/seconds per session, band-aware. A change of band
 *   (or of exercise) starts a new run in a new segment colour, and a `band` marker labels the
 *   change, so "fewer reps on a heavier band" is visibly a new run and not a drop on the old line.
 *
 * Level ids are compared, never indices (invariant 5); the "L3"/"Rung 3" ordinal is the engine's.
 */
import { BAND_ORDER, exerciseForLevel, ladderPosition, levelOrdinal } from '@roamfit/engine';
import type { BandId, PerformedSession } from '@roamfit/engine';
import type { Exercise, ProgressionFamily } from '@roamfit/data';
import type { exerciseCatalogRepo } from '@roamfit/store';
import type { ChartMarker, SeriesPoint } from './chartGeometry';
import { unitLabel } from './exerciseProgress';
import type { ProgressUnit } from './exerciseProgress';

/** One session, as either series needs it. */
export interface SeriesSession {
  localDate: string;
  exerciseId: string;
  exerciseName: string;
  /** Stable level id the session ran at (null for entries that predate level tracking). */
  levelId: string | null;
  bestReps: number | null;
  bestSeconds: number | null;
  band: BandId | null;
  tempoSec: number;
  restSec: number;
  setsCompleted: number;
}

const rungOf = (family: ProgressionFamily, levelId: string): number | null => {
  const { n } = levelOrdinal(family, levelId);
  return n >= 1 ? n : null;
};

/** `L3` ticks where the stable level id differs between consecutive sessions that have one. */
export function rungMarkers(
  family: ProgressionFamily,
  sessions: readonly SeriesSession[],
): ChartMarker[] {
  const markers: ChartMarker[] = [];
  let prev: string | null = null;
  for (const s of sessions) {
    if (s.levelId && prev && s.levelId !== prev) {
      const n = rungOf(family, s.levelId);
      if (n !== null) markers.push({ localDate: s.localDate, label: `L${n}`, kind: 'rung' });
    }
    if (s.levelId) prev = s.levelId;
  }
  return markers;
}

// ------------------------------------------------------------------------------------------
// Progress
// ------------------------------------------------------------------------------------------

export interface LadderSeries {
  points: SeriesPoint[];
  /** Human readout per point: "Rung 3 · B3 × 8 reps · 3 sets". */
  labels: string[];
  /** Exercise name per point (for the Trail card readout). */
  pointExercise: string[];
  markers: ChartMarker[];
}

/** "Rung 3 · B3 × 8 reps · 3 sets"; bodyweight has no band, a time metric shows seconds. */
export function ladderLabel(
  rung: number,
  band: BandId | null,
  unit: ProgressUnit,
  value: number,
  sets: number,
): string {
  const work = unitLabel(unit, value);
  return `Rung ${rung} · ${band ? `${band} × ${work}` : work} · ${sets} ${sets === 1 ? 'set' : 'sets'}`;
}

export function steps(n: number): string {
  return `${n} ${n === 1 ? 'step' : 'steps'}`;
}

/**
 * `withinRung` plots each session's steps up its own rung (`stepsInRung`, 0 at the rung's floor)
 * instead of the cumulative ladder position — for a graph that shows one level only.
 */
export function buildLadderSeries(
  family: ProgressionFamily,
  library: readonly Exercise[],
  sessions: readonly SeriesSession[],
  { withinRung = false }: { withinRung?: boolean } = {},
): LadderSeries {
  const out: LadderSeries = {
    points: [],
    labels: [],
    pointExercise: [],
    markers: rungMarkers(family, sessions),
  };
  let skipped = false;
  for (const s of sessions) {
    const performed: PerformedSession = {
      bestReps: s.bestReps,
      bestSeconds: s.bestSeconds,
      band: s.band,
      tempoSec: s.tempoSec,
      restSec: s.restSec,
      setsCompleted: s.setsCompleted,
    };
    const placed = ladderPosition(family, s.levelId, performed, library);
    if (!placed) {
      if (out.points.length > 0) skipped = true;
      continue;
    }
    // Same exercise the engine measured against, so the readout names the unit it counted in.
    const anchor = exerciseForLevel(family, placed.levelId, library);
    const unit: ProgressUnit = anchor?.metric === 'time' ? 'seconds' : 'reps';
    const value = (unit === 'seconds' ? s.bestSeconds : s.bestReps) ?? 0;
    out.points.push({
      localDate: s.localDate,
      value: withinRung ? placed.stepsInRung : placed.position,
      gapBefore: skipped,
    });
    out.labels.push(ladderLabel(placed.rung, s.band, unit, value, s.setsCompleted));
    out.pointExercise.push(s.exerciseName);
    skipped = false;
  }
  return out;
}

// ------------------------------------------------------------------------------------------
// Best set, band-aware
// ------------------------------------------------------------------------------------------

export interface BestSetSeries {
  points: SeriesPoint[];
  /** Band for each point (null for bodyweight work). */
  pointBand: (BandId | null)[];
  pointExercise: string[];
  /** Band ticks, plus rung ticks when a family was given. */
  markers: ChartMarker[];
  /** One entry per segment colour: the exercise, plus its band when it had one. */
  legend: { label: string; segment: number }[];
}

/** "8 reps @ B3"; bodyweight is just "8 reps". */
export function bestSetLabel(unit: ProgressUnit, value: number, band: BandId | null): string {
  return band ? `${unitLabel(unit, value)} @ ${band}` : unitLabel(unit, value);
}

/**
 * `family` adds rung ticks (Trail card). `unit` picks the value of each session; sessions with
 * nothing in that unit are left out with the line broken across them.
 */
export function buildBestSetSeries(
  sessions: readonly SeriesSession[],
  unit: ProgressUnit | null,
  family?: ProgressionFamily,
): BestSetSeries {
  const out: BestSetSeries = {
    points: [],
    pointBand: [],
    pointExercise: [],
    markers: [],
    legend: [],
  };
  if (!unit) return out;

  // A colour belongs to an (exercise, band) pair, in order of first appearance.
  const segmentOf = new Map<string, number>();
  let skipped = false;
  let prev: SeriesSession | null = null;
  for (const s of sessions) {
    const value = unit === 'reps' ? s.bestReps : s.bestSeconds;
    if (value === null) {
      if (out.points.length > 0) skipped = true;
      continue;
    }
    const key = `${s.exerciseId}|${s.band ?? ''}`;
    if (!segmentOf.has(key)) {
      segmentOf.set(key, segmentOf.size);
      out.legend.push({
        label: s.band ? `${s.exerciseName} · ${s.band}` : s.exerciseName,
        segment: segmentOf.size - 1,
      });
    }
    // A band change on the same exercise (heavier OR lighter) is a tick; an exercise change is
    // already a new colour, and a rung tick if the level moved.
    if (prev && prev.exerciseId === s.exerciseId && prev.band && s.band && prev.band !== s.band) {
      out.markers.push({ localDate: s.localDate, label: s.band, kind: 'band' });
    }
    out.points.push({
      localDate: s.localDate,
      value,
      segment: segmentOf.get(key),
      gapBefore: skipped,
    });
    out.pointBand.push(s.band);
    out.pointExercise.push(s.exerciseName);
    skipped = false;
    prev = s;
  }
  if (family) out.markers.push(...rungMarkers(family, sessions));
  out.markers.sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0));
  return out;
}

/** One exercise's single-value best: its top reps/seconds at the heaviest band it was done with. */
export interface BestSetStat {
  exerciseId: string;
  name: string;
  value: number;
  /** The heaviest band this exercise was logged with; null for bodyweight work. */
  band: BandId | null;
}

/**
 * The Trail card's Best set: one stat per exercise, in order of first appearance. The value is the
 * best reps/seconds among the sessions at that exercise's HEAVIEST band (`BAND_ORDER`), so a
 * lighter band's bigger number never hides the strongest one. Bodyweight sessions carry no band;
 * they only count when the exercise has no banded session. Sessions with nothing in `unit` are
 * skipped, and an exercise with none is left out.
 */
export function buildBestSetStats(
  sessions: readonly SeriesSession[],
  unit: ProgressUnit | null,
): BestSetStat[] {
  if (!unit) return [];
  const byExercise = new Map<string, BestSetStat>();
  for (const s of sessions) {
    const value = unit === 'reps' ? s.bestReps : s.bestSeconds;
    if (value === null) continue;
    const cur = byExercise.get(s.exerciseId);
    if (!cur) {
      byExercise.set(s.exerciseId, {
        exerciseId: s.exerciseId,
        name: s.exerciseName,
        value,
        band: s.band,
      });
      continue;
    }
    const rank = (b: BandId | null) => (b ? BAND_ORDER.indexOf(b) : -1);
    if (rank(s.band) > rank(cur.band) || (rank(s.band) === rank(cur.band) && value > cur.value)) {
      cur.value = value;
      cur.band = s.band;
    }
  }
  return [...byExercise.values()];
}

// ------------------------------------------------------------------------------------------
// One exercise (detail page)
// ------------------------------------------------------------------------------------------

type ExerciseHistory = exerciseCatalogRepo.ExerciseHistoryPerformance;

const asSessions = (history: readonly ExerciseHistory[], exercise: Exercise): SeriesSession[] =>
  history.map((p) => ({
    localDate: p.localDate,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    levelId: p.progressionLevelIdAtTime,
    bestReps: p.bestReps,
    bestSeconds: p.bestSeconds,
    band: p.band,
    tempoSec: p.tempoSec,
    restSec: p.restSec,
    setsCompleted: p.setsCompleted,
  }));

/** The detail page's Best set series: band-aware, no rung ticks (one exercise sits on one rung). */
export function buildExerciseBestSeries(
  history: readonly ExerciseHistory[],
  exercise: Exercise,
  unit: ProgressUnit,
): BestSetSeries {
  return buildBestSetSeries(asSessions(history, exercise), unit);
}

/**
 * The detail page's Progress series, or `null` when it does not apply: the exercise is not on a
 * ladder (warm-ups, cool-downs), or none of its sessions can be placed. Only sessions that ran in
 * THIS exercise's family count — an approval-time addition or a swap-in carries another slot's
 * family id and is left as a gap rather than placed on a ladder it was not climbing.
 */
export function buildExerciseLadder(
  history: readonly ExerciseHistory[],
  exercise: Exercise,
  families: readonly ProgressionFamily[],
  library: readonly Exercise[],
): LadderSeries | null {
  if (!exercise.progression_family) return null;
  const family = families.find((f) => f.id === exercise.progression_family);
  if (!family) return null;
  const sessions = asSessions(history, exercise).map((s, i) => ({
    ...s,
    levelId: history[i].progressionFamilyId === family.id ? s.levelId : null,
  }));
  const ladder = buildLadderSeries(family, library, sessions);
  return ladder.points.length > 0 ? ladder : null;
}
