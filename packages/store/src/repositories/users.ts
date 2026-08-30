/**
 * §4.3 User repository. Single local record in v1 (`id = 'local'`) — multi-user is not in scope,
 * per the brief's silence on it; the schema still carries `user_id` columns everywhere so this
 * is not a rewrite later.
 */
import { eq } from 'drizzle-orm';
import { DEFAULT_ANCHORS_AVAILABLE } from '@roamfit/engine';
import type { Limitation as EngineLimitation, UserProfile } from '@roamfit/engine';
import type { Anchor } from '@roamfit/data';
import type { Db } from '../db';
import { schema } from '../db';
import { newId } from '../ids';
import { logSignalEvent } from './signals';

const USER_ID = 'local';

export interface UserRecord {
  id: string;
  units: 'kg' | 'lb';
  weeklyTarget: number;
  anchorsAvailable: Anchor[];
  bandTensions: Record<string, unknown>;
  passportEnabled: boolean;
  healthWriteEnabled: boolean;
  notificationPrefs: Record<string, unknown>;
  lastKnownTzId: string | null;
  hasEverCompletedSession: boolean;
}

function rowToUser(row: typeof schema.users.$inferSelect): UserRecord {
  return {
    id: row.id,
    units: row.units,
    weeklyTarget: row.weeklyTarget,
    anchorsAvailable: JSON.parse(row.anchorsAvailable) as Anchor[],
    bandTensions: JSON.parse(row.bandTensions),
    passportEnabled: row.passportEnabled,
    healthWriteEnabled: row.healthWriteEnabled,
    notificationPrefs: JSON.parse(row.notificationPrefs),
    lastKnownTzId: row.lastKnownTzId,
    hasEverCompletedSession: row.hasEverCompletedSession,
  };
}

/** Creates the single local user row with §5.3 defaults if it doesn't exist yet. Idempotent. */
export function ensureUser(db: Db, now: string): UserRecord {
  const existing = db.select().from(schema.users).where(eq(schema.users.id, USER_ID)).all();
  if (existing.length > 0) return rowToUser(existing[0]);

  db.insert(schema.users)
    .values({
      id: USER_ID,
      anchorsAvailable: JSON.stringify(DEFAULT_ANCHORS_AVAILABLE),
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return rowToUser(db.select().from(schema.users).where(eq(schema.users.id, USER_ID)).all()[0]);
}

export function getUser(db: Db): UserRecord | null {
  const rows = db.select().from(schema.users).where(eq(schema.users.id, USER_ID)).all();
  return rows.length > 0 ? rowToUser(rows[0]) : null;
}

export interface UserPatch {
  units?: 'kg' | 'lb';
  weeklyTarget?: number;
  anchorsAvailable?: Anchor[];
  passportEnabled?: boolean;
  healthWriteEnabled?: boolean;
}

export function updateUser(db: Db, patch: UserPatch, now: string): void {
  ensureUser(db, now); // idempotent — a settings update before the user row exists must not no-op
  const values: Record<string, unknown> = { updatedAt: now };
  if (patch.units !== undefined) values.units = patch.units;
  if (patch.weeklyTarget !== undefined) values.weeklyTarget = patch.weeklyTarget;
  if (patch.anchorsAvailable !== undefined) {
    values.anchorsAvailable = JSON.stringify(patch.anchorsAvailable);
  }
  if (patch.passportEnabled !== undefined) values.passportEnabled = patch.passportEnabled;
  if (patch.healthWriteEnabled !== undefined) values.healthWriteEnabled = patch.healthWriteEnabled;
  db.update(schema.users).set(values).where(eq(schema.users.id, USER_ID)).run();
}

export function markHasEverCompletedSession(db: Db, now: string): void {
  db.update(schema.users)
    .set({ hasEverCompletedSession: true, updatedAt: now })
    .where(eq(schema.users.id, USER_ID))
    .run();
}

/**
 * §8.3/§9.3 — device timezone change is a signal, not just metadata. Call this whenever the
 * store observes the device's current tz_id (e.g. at session generation). Logs a `tz_change`
 * signal event the first time it differs from the last known one, and always updates the
 * stored value. A brand-new user (lastKnownTzId null) does not log a spurious first event.
 */
export function observeTzId(db: Db, tzId: string, utcInstant: string, localDate: string): void {
  const user = getUser(db) ?? ensureUser(db, utcInstant);
  if (user.lastKnownTzId !== null && user.lastKnownTzId !== tzId) {
    logSignalEvent(db, {
      sessionId: null,
      type: 'tz_change',
      payload: { from: user.lastKnownTzId, to: tzId },
      utcInstant,
      localDate,
    });
  }
  db.update(schema.users)
    .set({ lastKnownTzId: tzId, updatedAt: utcInstant })
    .where(eq(schema.users.id, USER_ID))
    .run();
}

// ------------------------------------------------------------------------------------------
// §4.3 limitations[] — own table (queryable, independent created_at/expires_at per §13.2).
// ------------------------------------------------------------------------------------------

function rowToLimitation(row: typeof schema.limitations.$inferSelect): EngineLimitation {
  return {
    tag: row.tag as EngineLimitation['tag'],
    note: row.note ?? undefined,
    createdAt: row.createdAt,
    source: row.source,
    expiresAt: row.expiresAt ?? undefined,
  };
}

export function addLimitation(
  db: Db,
  input: Omit<EngineLimitation, 'createdAt'> & { createdAt?: string },
  now: string,
): void {
  db.insert(schema.limitations)
    .values({
      id: newId(),
      userId: USER_ID,
      tag: input.tag,
      note: input.note ?? null,
      createdAt: input.createdAt ?? now,
      source: input.source,
      expiresAt: input.expiresAt ?? null,
    })
    .run();
}

/** Active limitations as of `today` (local_date) — expired ones are excluded, matching the
 *  engine's own hard-filter reading of `UserProfile.limitations`. */
export function getActiveLimitations(db: Db, today: string): EngineLimitation[] {
  const rows = db
    .select()
    .from(schema.limitations)
    .where(eq(schema.limitations.userId, USER_ID))
    .all();
  return rows.filter((r) => !r.expiresAt || r.expiresAt >= today).map(rowToLimitation);
}

export function buildUserProfile(db: Db, today: string): UserProfile {
  const user = ensureUser(db, today);
  return {
    units: user.units,
    weeklyTarget: user.weeklyTarget,
    limitations: getActiveLimitations(db, today),
    anchorsAvailable: user.anchorsAvailable,
  };
}
