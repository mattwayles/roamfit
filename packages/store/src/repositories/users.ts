/**
 * §4.3 User repository. Single local record in v1 (`id = 'local'`) — multi-user is not in scope,
 * per the brief's silence on it; the schema still carries `user_id` columns everywhere so this
 * is not a rewrite later.
 */
import { eq } from 'drizzle-orm';
import { DEFAULT_ANCHORS_AVAILABLE } from '@roamfit/engine';
import type { BandId, Limitation as EngineLimitation, UserProfile } from '@roamfit/engine';
import type { Anchor } from '@roamfit/data';
import type { Db } from '../db';
import { schema } from '../db';
import { newId } from '../ids';
import { logSignalEvent } from './signals';
import { getDisabledExerciseIds } from './exerciseState';

const USER_ID = 'local';

/** Shape of the `notification_prefs` JSON column. Every field optional/absent-means-default so an
 *  existing row (or a fresh `{}`) is always valid — see `DEFAULT_NOTIFICATION_PREFS`. */
export interface NotificationPrefs {
  /** §9.8/§10.8 — issue #20. Off disables the 10pm-7am clamp entirely (notifications may land at
   *  any observed-training hour); on (the default) is the original always-on behavior. */
  quietHoursEnabled?: boolean;
}

/**
 * §4.3 / spec §1140 — one band's user-editable identity. Colour is the point: on a card, a band
 * is far easier to recognise by the colour of the thing in your bag than by an abstract "B2".
 */
export interface BandTension {
  /** What the user calls it. Defaults to the Bn id so a prescription always reads. */
  label: string;
  /** Any RN-acceptable colour string. User-editable, so nothing may assume a fixed palette —
   *  callers deriving contrast must compute it from the value, not look it up. */
  color: string;
  approxLoad?: string;
  note?: string;
}

/**
 * Defaults for B1-B5. Deliberately defaults, not constants: spec §1140 is explicit that "band
 * brands differ", which is exactly why this is user-editable. These follow the common loop-band
 * progression (yellow → red → black → purple → green, lightest to heaviest); a user whose set is
 * different edits them and nothing here has to change.
 */
export const DEFAULT_BAND_TENSIONS: Record<BandId, BandTension> = {
  B1: { label: 'B1', color: '#facc15' },
  B2: { label: 'B2', color: '#dc2626' },
  B3: { label: 'B3', color: '#1f2937' },
  B4: { label: 'B4', color: '#7c3aed' },
  B5: { label: 'B5', color: '#16a34a' },
};

export const DEFAULT_NOTIFICATION_PREFS: Required<NotificationPrefs> = {
  quietHoursEnabled: true,
};

export interface UserRecord {
  id: string;
  units: 'kg' | 'lb';
  weeklyTarget: number;
  anchorsAvailable: Anchor[];
  /** Always complete: `DEFAULT_BAND_TENSIONS` is merged under whatever the row holds, so an
   *  existing `'{}'` row (every row, until Settings gains an editor) still yields five usable
   *  bands and no migration is needed. */
  bandTensions: Record<BandId, BandTension>;
  passportEnabled: boolean;
  healthWriteEnabled: boolean;
  notificationPrefs: NotificationPrefs;
  lastKnownTzId: string | null;
  hasEverCompletedSession: boolean;
  hasAcknowledgedDisclaimer: boolean;
}

/** Per band, the user's stored fields over the defaults — so a row that customises only a colour
 *  keeps the default label, and a row that stores nothing at all is still complete. */
function mergeBandTensions(
  stored: Partial<Record<BandId, Partial<BandTension>>>,
): Record<BandId, BandTension> {
  const out = {} as Record<BandId, BandTension>;
  for (const id of Object.keys(DEFAULT_BAND_TENSIONS) as BandId[]) {
    out[id] = { ...DEFAULT_BAND_TENSIONS[id], ...(stored?.[id] ?? {}) };
  }
  return out;
}

function rowToUser(row: typeof schema.users.$inferSelect): UserRecord {
  return {
    id: row.id,
    units: row.units,
    weeklyTarget: row.weeklyTarget,
    anchorsAvailable: JSON.parse(row.anchorsAvailable) as Anchor[],
    bandTensions: mergeBandTensions(
      JSON.parse(row.bandTensions) as Partial<Record<BandId, Partial<BandTension>>>,
    ),
    passportEnabled: row.passportEnabled,
    healthWriteEnabled: row.healthWriteEnabled,
    notificationPrefs: JSON.parse(row.notificationPrefs) as NotificationPrefs,
    lastKnownTzId: row.lastKnownTzId,
    hasEverCompletedSession: row.hasEverCompletedSession,
    hasAcknowledgedDisclaimer: row.hasAcknowledgedDisclaimer,
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
  /** Shallow-merged onto the existing `notificationPrefs`, not replaced wholesale — a settings
   *  screen editing one field must not clobber others it doesn't know about. */
  notificationPrefs?: NotificationPrefs;
}

export function updateUser(db: Db, patch: UserPatch, now: string): void {
  const current = ensureUser(db, now); // idempotent — a settings update before the user row exists must not no-op
  const values: Record<string, unknown> = { updatedAt: now };
  if (patch.units !== undefined) values.units = patch.units;
  if (patch.weeklyTarget !== undefined) values.weeklyTarget = patch.weeklyTarget;
  if (patch.anchorsAvailable !== undefined) {
    values.anchorsAvailable = JSON.stringify(patch.anchorsAvailable);
  }
  if (patch.passportEnabled !== undefined) values.passportEnabled = patch.passportEnabled;
  if (patch.healthWriteEnabled !== undefined) values.healthWriteEnabled = patch.healthWriteEnabled;
  if (patch.notificationPrefs !== undefined) {
    values.notificationPrefs = JSON.stringify({
      ...current.notificationPrefs,
      ...patch.notificationPrefs,
    });
  }
  db.update(schema.users).set(values).where(eq(schema.users.id, USER_ID)).run();
}

/** §13.3 — marks the first-launch medical disclaimer acknowledged. One-way (no "un-acknowledge"
 *  needed — the permanent settings-screen copy is the ongoing access point, not a re-prompt). */
export function acknowledgeDisclaimer(db: Db, now: string): void {
  ensureUser(db, now);
  db.update(schema.users)
    .set({ hasAcknowledgedDisclaimer: true, updatedAt: now })
    .where(eq(schema.users.id, USER_ID))
    .run();
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
    disabledExerciseIds: getDisabledExerciseIds(db),
  };
}
