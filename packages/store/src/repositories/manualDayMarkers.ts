/**
 * §14.1.6 manual day-marker overrides for the calendar heatmap — per user x local_date
 * (invariant 7's per-user-state shape, keyed by date rather than exercise/family). Lets a day be
 * re-tagged by hand: a workout done outside RoamFit, or a travel day that went unlogged at the
 * time. Last-write-wins per day — this corrects what the calendar shows, it is not a history of
 * edits — and never touches `sessions` or `signal_events`: the marker is display-only.
 */
import { eq, and } from 'drizzle-orm';
import type { Focus } from '@roamfit/data';
import type { Db } from '../db';
import { schema } from '../db';

const USER_ID = 'local';

export type DayMarker = 'none' | 'travel' | Focus;

export function setManualDayMarker(
  db: Db,
  localDate: string,
  marker: DayMarker,
  updatedAt: string,
): void {
  const existing = db
    .select({ localDate: schema.manualDayMarkers.localDate })
    .from(schema.manualDayMarkers)
    .where(
      and(
        eq(schema.manualDayMarkers.userId, USER_ID),
        eq(schema.manualDayMarkers.localDate, localDate),
      ),
    )
    .all();
  if (existing.length > 0) {
    db.update(schema.manualDayMarkers)
      .set({ marker, updatedAt })
      .where(
        and(
          eq(schema.manualDayMarkers.userId, USER_ID),
          eq(schema.manualDayMarkers.localDate, localDate),
        ),
      )
      .run();
  } else {
    db.insert(schema.manualDayMarkers)
      .values({ userId: USER_ID, localDate, marker, updatedAt })
      .run();
  }
}

/** Keyed by localDate for O(1) lookup while building the calendar window. */
export function getManualDayMarkers(db: Db): Map<string, DayMarker> {
  const rows = db
    .select()
    .from(schema.manualDayMarkers)
    .where(eq(schema.manualDayMarkers.userId, USER_ID))
    .all();
  return new Map(rows.map((r) => [r.localDate, r.marker as DayMarker]));
}
