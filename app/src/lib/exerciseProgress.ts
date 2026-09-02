/**
 * "Am I getting stronger at this?" — pure shaping of the store's per-session performance history
 * into the detail page's chart and its gain summary. Same contract as `dashboard.ts` and
 * `exerciseCatalog.ts`: the caller does the reading, this file only derives.
 *
 * The measurable dimensions a band/bodyweight session can improve on are reps, held seconds, sets
 * completed, total volume, and band. All five are tracked here; the chart plots the headline one
 * (best set), because that is the number a user recognises as "what I can do now".
 *
 * **A gain, once earned, is not taken back.** `improved` compares the *best* session against the
 * *first*, not the latest against the first — a lighter day after a heavy week is a normal part of
 * training, and re-framing it as a loss is exactly the punishment invariant 4 rules out. The
 * latest session is still reported, plainly, so the page never hides what actually happened.
 */
import { BAND_ORDER } from '@roamfit/engine';
import type { BandId } from '@roamfit/engine';
import type { Metric } from '@roamfit/data';
import type { exerciseCatalogRepo } from '@roamfit/store';

type Performance = exerciseCatalogRepo.ExerciseSessionPerformance;

/** What the chart is denominated in. `amrap` and `reps` both count reps. */
export type ProgressUnit = 'reps' | 'seconds';

export interface ChartPoint {
  localDate: string;
  value: number;
}

export interface Gain {
  first: number;
  latest: number;
  best: number;
  /** Best beats the first session — a real increase since the first time it was completed. */
  improved: boolean;
}

export interface BandGain {
  first: BandId;
  latest: BandId;
  best: BandId;
  improved: boolean;
}

export interface ExerciseProgress {
  /** Completed sessions containing this exercise. 0 means nothing has been logged yet. */
  sessions: number;
  firstDate: string | null;
  latestDate: string | null;
  unit: ProgressUnit;
  /** Best set per session, oldest first — the charted series. */
  chart: ChartPoint[];
  /** Total volume (reps or seconds across completed sets) per session, oldest first. */
  volumeChart: ChartPoint[];
  bestSet: Gain | null;
  sets: Gain | null;
  volume: Gain | null;
  band: BandGain | null;
  /** Any dimension improved on the first session. */
  hasGain: boolean;
}

function gainOf(values: number[]): Gain | null {
  if (values.length === 0) return null;
  const first = values[0];
  const best = Math.max(...values);
  return { first, latest: values[values.length - 1], best, improved: best > first };
}

function bandGainOf(bands: (BandId | null)[]): BandGain | null {
  const present = bands.filter((b): b is BandId => b !== null);
  if (present.length === 0) return null;
  const first = present[0];
  const best = present.reduce((a, b) => (BAND_ORDER.indexOf(b) > BAND_ORDER.indexOf(a) ? b : a));
  return {
    first,
    latest: present[present.length - 1],
    best,
    improved: BAND_ORDER.indexOf(best) > BAND_ORDER.indexOf(first),
  };
}

/**
 * Which unit this exercise's history is actually in. The library record's `metric` is the intent,
 * but the logs are the fact — a timed exercise swapped onto a rep-logged entry (or vice versa)
 * should chart whatever was really recorded, so data wins and the record only breaks a tie.
 */
export function progressUnit(history: Performance[], metric: Metric): ProgressUnit {
  const reps = history.filter((p) => p.bestReps !== null).length;
  const seconds = history.filter((p) => p.bestSeconds !== null).length;
  if (reps !== seconds) return reps > seconds ? 'reps' : 'seconds';
  return metric === 'time' ? 'seconds' : 'reps';
}

export function buildExerciseProgress(history: Performance[], metric: Metric): ExerciseProgress {
  const unit = progressUnit(history, metric);
  const bestOf = (p: Performance) => (unit === 'reps' ? p.bestReps : p.bestSeconds);
  const totalOf = (p: Performance) => (unit === 'reps' ? p.totalReps : p.totalSeconds);

  // A session that logged nothing in this unit has no point to plot; it would otherwise appear as
  // a zero, which reads as a collapse rather than as an absence.
  const measured = history.filter((p) => bestOf(p) !== null);

  const bestSet = gainOf(measured.map((p) => bestOf(p) as number));
  const sets = gainOf(history.map((p) => p.setsCompleted));
  const volume = gainOf(measured.map(totalOf));
  const band = bandGainOf(history.map((p) => p.band));

  return {
    sessions: history.length,
    firstDate: history.length > 0 ? history[0].localDate : null,
    latestDate: history.length > 0 ? history[history.length - 1].localDate : null,
    unit,
    chart: measured.map((p) => ({ localDate: p.localDate, value: bestOf(p) as number })),
    volumeChart: measured.map((p) => ({ localDate: p.localDate, value: totalOf(p) })),
    bestSet,
    sets,
    volume,
    band,
    hasGain: [bestSet?.improved, sets?.improved, volume?.improved, band?.improved].some(Boolean),
  };
}

// ------------------------------------------------------------------------------------------
// Copy. Kept beside the maths so the register ("nothing here scolds") is decided in one place.
// ------------------------------------------------------------------------------------------

export function unitLabel(unit: ProgressUnit, value: number): string {
  if (unit === 'seconds') return `${value}s`;
  return `${value} ${value === 1 ? 'rep' : 'reps'}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-08-01` -> `Aug 1`. Parsed by hand rather than through `Date`, which would re-interpret a
 *  local_date as UTC midnight and print the day before west of Greenwich (invariant 6). */
export function formatLocalDate(localDate: string): string {
  const [, month, day] = localDate.split('-');
  const monthName = MONTHS[Number(month) - 1];
  return monthName ? `${monthName} ${Number(day)}` : localDate;
}

export interface GainLine {
  label: string;
  detail: string;
  improved: boolean;
}

/** The rows under the chart: one per dimension that has history, each stating first -> best in
 *  its own units. Dimensions that never moved are still listed (they are honest context), just
 *  not badged. */
export function gainLines(progress: ExerciseProgress): GainLine[] {
  const lines: GainLine[] = [];
  const { unit, bestSet, sets, volume, band } = progress;

  if (bestSet) {
    lines.push({
      label: 'Best set',
      detail: bestSet.improved
        ? `${unitLabel(unit, bestSet.first)} → ${unitLabel(unit, bestSet.best)}`
        : unitLabel(unit, bestSet.best),
      improved: bestSet.improved,
    });
  }
  if (sets) {
    lines.push({
      label: 'Sets in a session',
      detail: sets.improved ? `${sets.first} → ${sets.best}` : `${sets.best}`,
      improved: sets.improved,
    });
  }
  if (volume) {
    lines.push({
      label: unit === 'seconds' ? 'Time under tension' : 'Total reps',
      detail: volume.improved
        ? `${unitLabel(unit, volume.first)} → ${unitLabel(unit, volume.best)}`
        : unitLabel(unit, volume.best),
      improved: volume.improved,
    });
  }
  if (band) {
    lines.push({
      label: 'Band',
      detail: band.improved ? `${band.first} → ${band.best}` : band.best,
      improved: band.improved,
    });
  }
  return lines;
}

/** The one-line headline above the chart. Never a comparison the user loses. */
export function progressSummary(progress: ExerciseProgress): string {
  if (progress.sessions === 0) return 'No sessions logged yet — this is where your history lands.';
  if (progress.sessions === 1) return 'One session logged. That is your baseline.';
  if (progress.hasGain && progress.firstDate) {
    return `Stronger than your first session on ${formatLocalDate(progress.firstDate)}.`;
  }
  return `${progress.sessions} sessions logged. Holding steady.`;
}
