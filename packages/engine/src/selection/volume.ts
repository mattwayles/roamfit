/**
 * Trailing muscle-set volume, per §5.2 OVER-WORKED / UNTRAINED / LOW. Main work only (primary
 * muscle = 1 credit/set, secondary = 0.5 credit/set — matches the prototype's `muscle_sets`).
 */
import type { Exercise } from '@roamfit/data';
import { daysBetween } from '../dates';
import type { LocalDate, SessionHistoryRecord } from '../types';
import {
  OVER_WORKED_MULTIPLIER,
  TRAILING_WINDOW_DAYS,
  LOW_VOLUME_THRESHOLD_SETS,
} from './constants';

const SECONDARY_CREDIT = 0.5;

export function trailingVolume(
  history: readonly SessionHistoryRecord[],
  library: readonly Exercise[],
  windowDays: number,
  today: LocalDate,
): Record<string, number> {
  const byId = new Map(library.map((e) => [e.id, e]));
  const vol: Record<string, number> = {};
  for (const session of history) {
    if (session.status === 'discarded' || session.status === 'skipped') continue;
    const age = daysBetween(session.localDate, today);
    if (age < 0 || age >= windowDays) continue;
    for (const entry of session.entries) {
      if (entry.role !== 'main') continue;
      const ex = byId.get(entry.exerciseId);
      if (!ex) continue;
      const sets = entry.sets ?? 1;
      for (const m of ex.primary) vol[m] = (vol[m] ?? 0) + sets;
      for (const m of ex.secondary) vol[m] = (vol[m] ?? 0) + sets * SECONDARY_CREDIT;
    }
  }
  return vol;
}

/** Muscles whose short-window trailing volume exceeds 1.5x the mean across trained muscles. */
export function overWorkedMuscles(
  history: readonly SessionHistoryRecord[],
  library: readonly Exercise[],
  today: LocalDate,
): Set<string> {
  const vol = trailingVolume(history, library, 7, today);
  const values = Object.values(vol);
  if (values.length === 0) return new Set();
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return new Set(
    Object.entries(vol)
      .filter(([, v]) => v > OVER_WORKED_MULTIPLIER * mean)
      .map(([m]) => m),
  );
}

/** Muscles relevant to `relevantMuscles` with zero 14-day volume. */
export function untrainedMuscles(
  history: readonly SessionHistoryRecord[],
  library: readonly Exercise[],
  today: LocalDate,
  relevantMuscles: ReadonlySet<string>,
): Set<string> {
  const vol = trailingVolume(history, library, TRAILING_WINDOW_DAYS, today);
  return new Set([...relevantMuscles].filter((m) => (vol[m] ?? 0) === 0));
}

/** Muscles relevant to `relevantMuscles` with 14-day volume in (0, threshold). */
export function lowVolumeMuscles(
  history: readonly SessionHistoryRecord[],
  library: readonly Exercise[],
  today: LocalDate,
  relevantMuscles: ReadonlySet<string>,
): Set<string> {
  const vol = trailingVolume(history, library, TRAILING_WINDOW_DAYS, today);
  return new Set(
    [...relevantMuscles].filter((m) => {
      const v = vol[m] ?? 0;
      return v > 0 && v < LOW_VOLUME_THRESHOLD_SETS;
    }),
  );
}

/** Muscles trained at `hard` difficulty within the last `RECOVERY_WINDOW_DAYS` days (§5.2 48h
 *  recovery — "anything trained hard in the last two days"). */
export function recentHardMuscles(
  history: readonly SessionHistoryRecord[],
  library: readonly Exercise[],
  today: LocalDate,
  windowDays: number,
): Set<string> {
  const byId = new Map(library.map((e) => [e.id, e]));
  const muscles = new Set<string>();
  for (const session of history) {
    if (session.status === 'discarded' || session.status === 'skipped') continue;
    const age = daysBetween(session.localDate, today);
    if (age < 0 || age > windowDays) continue;
    for (const entry of session.entries) {
      if (entry.role !== 'main' || entry.difficulty !== 'hard') continue;
      const ex = byId.get(entry.exerciseId);
      if (!ex) continue;
      for (const m of ex.primary) muscles.add(m);
    }
  }
  return muscles;
}

/** True when this exact `focus` was trained yesterday (§5.2: "same focus trained yesterday ⇒
 *  this session is not `hard` on the same muscles"). */
export function sameFocusTrainedYesterday(
  history: readonly SessionHistoryRecord[],
  today: LocalDate,
  focus: string,
): boolean {
  return history.some(
    (s) =>
      s.status !== 'discarded' &&
      s.status !== 'skipped' &&
      s.focus === focus &&
      daysBetween(s.localDate, today) === 1,
  );
}
