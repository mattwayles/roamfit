/**
 * `local_date`/`tz_id` helpers (§12, invariant 6). Re-exports the engine's pure calendar-day
 * arithmetic (`daysBetween`/`addDays`, already UTC-midnight-anchored so DST never enters into
 * it) and adds the one thing the engine doesn't need but the persistence layer does: deriving
 * `local_date` from a real `utc_instant` + IANA `tz_id` pair, which is what makes flying east
 * (or west) compute correctly instead of losing or duplicating a day.
 *
 * The rule this file exists to make the path of least resistance: **never** derive a date with
 * `new Date().toISOString().slice(0, 10)` or any other UTC-wall-time shortcut. Always go through
 * `localDateForInstant`.
 */
import { daysBetween, addDays } from '@roamfit/engine';
import type { LocalDate } from '@roamfit/engine';

export { daysBetween, addDays };
export type { LocalDate };

/** The one correct way to derive a `local_date` from a moment in time: ask the IANA zone what
 *  calendar date it was there. `utcInstant` is any string `Date` can parse (we always store/pass
 *  full ISO instants). `en-CA` is a locale trick — it's the one built-in Intl locale whose short
 *  date format is exactly `YYYY-MM-DD`, so no manual reassembly of parts is needed. */
export function localDateForInstant(utcInstant: string, tzId: string): LocalDate {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tzId,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date(utcInstant));
}

/** True when `date` falls within the rolling window ending at (and including) `today`, e.g.
 *  `windowDays = 7` for §9.1's weekly-target window: `today` itself plus the 6 days before it. */
export function isWithinRollingWindow(
  date: LocalDate,
  today: LocalDate,
  windowDays: number,
): boolean {
  const diff = daysBetween(date, today);
  return diff >= 0 && diff < windowDays;
}

/** The device's current IANA timezone — the one place this package touches the ambient clock,
 *  since (unlike the engine) the persistence layer's whole job is bridging real device state
 *  into storage. Callers that want determinism (tests) pass their own `tzId` instead of calling
 *  this. */
export function deviceTzId(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
