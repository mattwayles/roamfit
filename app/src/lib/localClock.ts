/**
 * The device's notion of "now," in the shapes `@roamfit/engine`/`@roamfit/store` want
 * (`EngineClock` = `{ today: LocalDate, tzId }`, plus a UTC instant string for persistence
 * timestamps). Invariant 6 (CLAUDE.md): all calendar math uses `local_date`, never UTC — so
 * `today` here is built from the device's local wall-clock date components (`Date`'s local
 * getters), not from a UTC slice of an ISO string.
 */
import type { EngineClock } from '@roamfit/engine';

export function localDateFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function currentTzId(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

export function nowEngineClock(): EngineClock {
  return { today: localDateFromDate(new Date()), tzId: currentTzId() };
}

export function nowUtcInstant(): string {
  return new Date().toISOString();
}
