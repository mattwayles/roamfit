/**
 * Did this session earn a new Passport stamp? The place name comes from the `passport_geocode`
 * deferred job, which until now only ran on a later screen focus — so the stamp arrived silently on
 * the Journey page. The completion screen instead asks for it right away: it drains the device
 * queue once (a GPS fix plus a reverse geocode) and reads back the `new_city` milestone that
 * `applyGeocodeResult` writes the first time a place appears.
 *
 * The lookup is bounded. It races a timeout, because a slow fix must never hold the finish line
 * hostage (invariant 1 — offline is not a degradation mode: no signal, no permission or no fix all
 * just resolve to `null`, and the queued job keeps retrying on its usual backoff, so the stamp
 * still lands on Journey later). The lookup never throws.
 */
import { milestonesRepo, processDeviceQueue, sessionsRepo } from '@roamfit/store';
import type { Db } from '@roamfit/store';
import { buildPassportSummary } from './dashboard';
import { geocodeCaller } from './geocode';
import { healthKitWriter } from './healthKit';
import { nowUtcInstant } from './localClock';
import { formatPlace } from './place';

/** How long the completion screen waits on the lookup before giving up on a stamp for now. */
export const STAMP_LOOKUP_TIMEOUT_MS = 6000;

export interface NewStamp {
  /** "Bend, OR, USA" — the Journey stamp for this place is seeded by the same string, so it
   *  looks identical there. */
  label: string;
  /** "OCT 3, 2026" — the session's own local date, set in the stamp like a passport entry. */
  dateLabel: string;
  /** How many distinct places the passport now holds (this one included). */
  placeCount: number;
  countryCount: number;
  /** The first stamp from this country. */
  newCountry: boolean;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "2026-10-03" -> "OCT 3, 2026", by string math (invariant 6: local_date never goes through UTC). */
export function formatStampDate(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const month = MONTHS[(m ?? 0) - 1];
  return month && d && y ? `${month} ${d}, ${y}` : localDate;
}

const drainDeviceQueue = (db: Db): Promise<unknown> =>
  processDeviceQueue(db, nowUtcInstant(), healthKitWriter, geocodeCaller);

export async function lookupNewStamp(
  db: Db,
  sessionId: string,
  timeoutMs: number = STAMP_LOOKUP_TIMEOUT_MS,
  drain: (db: Db) => Promise<unknown> = drainDeviceQueue,
): Promise<NewStamp | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      drain(db).catch(() => {}),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
    const milestone = milestonesRepo
      .getMilestonesForSession(db, sessionId)
      .find((m) => m.type === 'new_city');
    const session = sessionsRepo.getSession(db, sessionId);
    if (!milestone || !session) return null;
    const p = milestone.payload;
    const label = formatPlace({
      city: (p.city as string | null) ?? null,
      region: p.region as string | null,
      countryCode: p.countryCode as string | null,
      country: p.country as string | null,
    });
    if (!label) return null;

    const completed = sessionsRepo.getCompletedSessionsForDashboard(db);
    const passport = buildPassportSummary(completed);
    const country = (p.country as string | null) ?? null;
    return {
      label,
      dateLabel: formatStampDate(session.localDate),
      placeCount: passport.places.length,
      countryCount: passport.countries.length,
      newCountry: country !== null && completed.filter((s) => s.country === country).length <= 1,
    };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
