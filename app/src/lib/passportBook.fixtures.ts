/** Test helpers for the Passport book: dashboard session summaries at named places. */
import type { sessionsRepo } from '@roamfit/store';

type DashboardSessionSummary = sessionsRepo.DashboardSessionSummary;

export function sessionAt(
  localDate: string,
  city: string | null,
  country: string | null = null,
  countryCode: string | null = null,
): DashboardSessionSummary {
  return {
    id: `session-${localDate}-${city ?? 'none'}`,
    localDate,
    actualMinutes: 30,
    estimatedMinutes: 30,
    focus: 'full',
    isQuick: false,
    city,
    country,
    region: null,
    countryCode,
  };
}

/** `count` distinct cities in one country, one session each on consecutive days from 2026-01-01. */
export function manyPlaces(count: number, country = 'Portugal', code = 'PT') {
  return Array.from({ length: count }, (_, i) =>
    sessionAt(
      `2026-01-${String(i + 1).padStart(2, '0')}`,
      `City${String(i + 1).padStart(2, '0')}`,
      country,
      code,
    ),
  );
}
