/**
 * Track 38 — persistence for earned badges. A badge is permanent: rows are inserted once (the
 * badge_id primary key makes a second award a no-op) and never updated except for `seen_at`.
 * Whether a badge is *earned* is the engine's call (`evaluateBadges`); this file only stores it.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';

const USER_ID = 'local';

export interface EarnedBadgeRecord {
  badgeId: string;
  earnedAt: string;
  localDate: string;
  /** The session it was earned in; null for retroactive (backfilled) badges. */
  sessionId: string | null;
  /** Found by the startup backfill, not earned in a session. Never celebrated on Summary. */
  retroactive: boolean;
  /** When the user was shown it; null = still NEW. */
  seenAt: string | null;
  payload: Record<string, unknown>;
}

export interface NewEarnedBadge {
  badgeId: string;
  localDate: string;
  sessionId: string | null;
  retroactive: boolean;
  payload?: Record<string, unknown>;
}

function rowToRecord(row: typeof schema.earnedBadges.$inferSelect): EarnedBadgeRecord {
  return {
    badgeId: row.badgeId,
    earnedAt: row.earnedAt,
    localDate: row.localDate,
    sessionId: row.sessionId,
    retroactive: row.retroactive,
    seenAt: row.seenAt,
    payload: JSON.parse(row.payload),
  };
}

/** Every earned badge, newest first (ties keep a stable order by id). */
export function getEarnedBadges(db: Db): EarnedBadgeRecord[] {
  return db
    .select()
    .from(schema.earnedBadges)
    .where(eq(schema.earnedBadges.userId, USER_ID))
    .all()
    .map(rowToRecord)
    .sort((a, b) => b.earnedAt.localeCompare(a.earnedAt) || a.badgeId.localeCompare(b.badgeId));
}

export function getEarnedBadgeIds(db: Db): Set<string> {
  return new Set(
    db
      .select({ id: schema.earnedBadges.badgeId })
      .from(schema.earnedBadges)
      .where(eq(schema.earnedBadges.userId, USER_ID))
      .all()
      .map((r) => r.id),
  );
}

/** Inserts the badges not already held; returns the ids actually inserted. */
export function insertEarnedBadges(db: Db, badges: NewEarnedBadge[], now: string): string[] {
  const held = getEarnedBadgeIds(db);
  const inserted: string[] = [];
  for (const b of badges) {
    if (held.has(b.badgeId)) continue;
    db.insert(schema.earnedBadges)
      .values({
        badgeId: b.badgeId,
        userId: USER_ID,
        earnedAt: now,
        localDate: b.localDate,
        sessionId: b.sessionId,
        retroactive: b.retroactive,
        seenAt: null,
        payload: JSON.stringify(b.payload ?? {}),
      })
      .run();
    held.add(b.badgeId);
    inserted.push(b.badgeId);
  }
  return inserted;
}

/** Marks the given badges seen (only those not already seen, so the first look is kept). */
export function markBadgesSeen(db: Db, badgeIds: readonly string[], now: string): void {
  if (badgeIds.length === 0) return;
  db.update(schema.earnedBadges)
    .set({ seenAt: now })
    .where(
      and(inArray(schema.earnedBadges.badgeId, [...badgeIds]), isNull(schema.earnedBadges.seenAt)),
    )
    .run();
}

/** How many earned badges have not been looked at yet (drives the NEW dot on Journey). */
export function countUnseen(db: Db): number {
  return db
    .select({ id: schema.earnedBadges.badgeId })
    .from(schema.earnedBadges)
    .where(and(eq(schema.earnedBadges.userId, USER_ID), isNull(schema.earnedBadges.seenAt)))
    .all().length;
}
