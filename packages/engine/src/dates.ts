/**
 * `local_date` calendar math (invariant 6: all calendar math uses `local_date`, never UTC wall
 * time). Dates are always `YYYY-MM-DD` strings. We use `Date.UTC` purely as a calendar-day
 * arithmetic engine — anchoring every date at UTC midnight sidesteps DST entirely, since we
 * never read a time-of-day component back out, only day differences and comparisons.
 */
import type { LocalDate } from './types';

function toUtcMillis(d: LocalDate): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

/** Whole calendar days from `a` to `b` (positive when `b` is after `a`). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((toUtcMillis(b) - toUtcMillis(a)) / MS_PER_DAY);
}

export function addDays(d: LocalDate, n: number): LocalDate {
  const ms = toUtcMillis(d) + n * 86_400_000;
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isBeforeOrEqual(a: LocalDate, b: LocalDate): boolean {
  return a <= b;
}
