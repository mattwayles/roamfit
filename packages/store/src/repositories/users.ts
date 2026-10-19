/**
 * §4.3 User repository. Single local record in v1 (`id = 'local'`) — multi-user is not in scope,
 * per the brief's silence on it; the schema still carries `user_id` columns everywhere so this
 * is not a rewrite later.
 */
import { eq } from 'drizzle-orm';
import {
  DEFAULT_ANCHORS_AVAILABLE,
  DEFAULT_BAND_SETTINGS,
  SINGLE_BANDS,
  resolveTrainingPreferences,
} from '@roamfit/engine';
import type {
  BandSettings,
  Limitation as EngineLimitation,
  SingleBandId,
  TrainingPreferences,
  UserProfile,
} from '@roamfit/engine';
import type { Anchor } from '@roamfit/data';
import { isLimitationChoiceId, tagsForLimitationChoices } from '@roamfit/data';
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
  /** Track 37f — the quiet window's start and end hours (0-23). Absent = 22 and 7. */
  quietHoursStart?: number;
  quietHoursEnd?: number;
  /** Master on/off for the daily motivational-pool notification (a request-driven feature, not
   *  from the deleted spec). Off cancels every scheduled one and stops scheduling new ones. */
  motivationEnabled?: boolean;
  /** "HH:MM" 24-hour local times, one per notification the user wants that day. Count is just
   *  this array's length — there is no separate count field. User-editable in Settings; always
   *  clamped through `quietHoursEnabled` at schedule time, never stored pre-clamped. */
  motivationTimes?: string[];
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
export const DEFAULT_BAND_TENSIONS: Record<SingleBandId, BandTension> = {
  B1: { label: 'B1', color: '#facc15' },
  B2: { label: 'B2', color: '#dc2626' },
  B3: { label: 'B3', color: '#1f2937' },
  B4: { label: 'B4', color: '#7c3aed' },
  B5: { label: 'B5', color: '#16a34a' },
};

export const DEFAULT_NOTIFICATION_PREFS: Required<NotificationPrefs> = {
  quietHoursEnabled: true,
  motivationEnabled: true,
  motivationTimes: ['18:00'],
  quietHoursStart: 22,
  quietHoursEnd: 7,
};

/** Which look the app wears: follow iOS, Daybreak (light), or Midnight (dark). */
export type ThemePreference = 'system' | 'light' | 'dark';

export interface UserRecord {
  id: string;
  units: 'kg' | 'lb';
  weeklyTarget: number;
  anchorsAvailable: Anchor[];
  /** Always complete: `DEFAULT_BAND_TENSIONS` is merged under whatever the row holds, so an
   *  existing `'{}'` row (every row, until Settings gains an editor) still yields five usable
   *  bands and no migration is needed. */
  bandTensions: Record<SingleBandId, BandTension>;
  /** Track 37i — always complete: which bands are owned, and whether to stack them. */
  bandSettings: BandSettings;
  passportEnabled: boolean;
  healthWriteEnabled: boolean;
  cueSoundsEnabled: boolean;
  /** Ask "how did that set feel?" as a modal over the rest screen (off = inline on it). */
  feedbackPromptEnabled: boolean;
  themePreference: ThemePreference;
  /** Stable Spotify vibe ids the user picked; `[]` = no preference. */
  spotifyVibes: string[];
  notificationPrefs: NotificationPrefs;
  /** Track 37a — the limitation choices the user picked (ids from `LIMITATION_CHOICES`), each
   *  with the local_date it was turned on. Unknown ids are dropped on read. */
  limitationChoices: LimitationChoiceRecord[];
  /** Track 37f — always complete: stored fields over `DEFAULT_TRAINING_PREFERENCES`. */
  trainingPreferences: TrainingPreferences;
  lastKnownTzId: string | null;
  hasEverCompletedSession: boolean;
  hasAcknowledgedDisclaimer: boolean;
  /** Track 37h — first-launch setup was started (disclaimer acknowledged) and not yet finished or
   *  skipped, so the app resumes it rather than opening Today. */
  onboardingInProgress: boolean;
}

export interface LimitationChoiceRecord {
  id: string;
  /** local_date the choice was turned on. */
  since: string;
}

/** The stored `limitation_choices` JSON, tolerant of damage the same way `parseStringArray` is. */
function parseLimitationChoices(raw: string): LimitationChoiceRecord[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is LimitationChoiceRecord =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as LimitationChoiceRecord).id === 'string' &&
        typeof (v as LimitationChoiceRecord).since === 'string' &&
        isLimitationChoiceId((v as LimitationChoiceRecord).id),
    );
  } catch {
    return [];
  }
}

/** The stored `training_prefs` JSON, resolved over the defaults. Damage (malformed JSON, a
 *  non-object, an unknown value for a field) falls back to the default for what is damaged. */
function parseTrainingPreferences(raw: string): TrainingPreferences {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      stored = parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through to defaults */
  }
  const defaults = resolveTrainingPreferences(undefined);
  const pick = <K extends keyof TrainingPreferences>(
    key: K,
    allowed: readonly TrainingPreferences[K][],
  ): TrainingPreferences[K] =>
    allowed.includes(stored[key] as TrainingPreferences[K])
      ? (stored[key] as TrainingPreferences[K])
      : defaults[key];
  return {
    goal: pick('goal', ['general', 'strength', 'muscle', 'endurance']),
    rest: pick('rest', ['shorter', 'standard', 'longer']),
    variety: pick('variety', ['consistent', 'balanced', 'varied']),
    recovery: pick('recovery', ['quick', 'standard', 'extra']),
    pace: pick('pace', ['steady', 'patient']),
    warmup: pick('warmup', ['short', 'standard', 'extended']),
  };
}

/** The stored `band_settings` JSON over the defaults; unknown band ids are dropped. */
function parseBandSettings(raw: string): BandSettings {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      stored = parsed as Record<string, unknown>;
    }
  } catch {
    /* defaults */
  }
  const owned = Array.isArray(stored.owned)
    ? SINGLE_BANDS.filter((b) => (stored.owned as unknown[]).includes(b))
    : [...DEFAULT_BAND_SETTINGS.owned];
  const stacking =
    typeof stored.stacking === 'boolean' ? stored.stacking : DEFAULT_BAND_SETTINGS.stacking;
  return { owned, stacking };
}

/** Per band, the user's stored fields over the defaults — so a row that customises only a colour
 *  keeps the default label, and a row that stores nothing at all is still complete. */
function mergeBandTensions(
  stored: Partial<Record<SingleBandId, Partial<BandTension>>>,
): Record<SingleBandId, BandTension> {
  const out = {} as Record<SingleBandId, BandTension>;
  for (const id of Object.keys(DEFAULT_BAND_TENSIONS) as SingleBandId[]) {
    out[id] = { ...DEFAULT_BAND_TENSIONS[id], ...(stored?.[id] ?? {}) };
  }
  return out;
}

/** A stored JSON string array, tolerant of damage: malformed JSON, a non-array, or non-string
 *  entries yield `[]` / the surviving strings rather than throwing on every user read. */
function parseStringArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function rowToUser(row: typeof schema.users.$inferSelect): UserRecord {
  return {
    id: row.id,
    units: row.units,
    weeklyTarget: row.weeklyTarget,
    anchorsAvailable: JSON.parse(row.anchorsAvailable) as Anchor[],
    bandTensions: mergeBandTensions(
      JSON.parse(row.bandTensions) as Partial<Record<SingleBandId, Partial<BandTension>>>,
    ),
    bandSettings: parseBandSettings(row.bandSettings),
    passportEnabled: row.passportEnabled,
    healthWriteEnabled: row.healthWriteEnabled,
    cueSoundsEnabled: row.cueSoundsEnabled,
    feedbackPromptEnabled: row.feedbackPromptEnabled,
    themePreference: row.themePreference as ThemePreference,
    spotifyVibes: parseStringArray(row.spotifyVibes),
    notificationPrefs: JSON.parse(row.notificationPrefs) as NotificationPrefs,
    limitationChoices: parseLimitationChoices(row.limitationChoices),
    trainingPreferences: parseTrainingPreferences(row.trainingPrefs),
    lastKnownTzId: row.lastKnownTzId,
    hasEverCompletedSession: row.hasEverCompletedSession,
    hasAcknowledgedDisclaimer: row.hasAcknowledgedDisclaimer,
    onboardingInProgress: row.onboardingState === 'in_progress',
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
      // Nothing assumed: a new user ticks Resistance bands before any band exercise is programmed.
      // Existing rows keep what they stored (an empty `{}` still reads as every band owned).
      bandSettings: JSON.stringify({ owned: [], stacking: false }),
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
  cueSoundsEnabled?: boolean;
  feedbackPromptEnabled?: boolean;
  themePreference?: ThemePreference;
  /** Replaces the stored list wholesale (it is a selection, not a bag to merge into). */
  spotifyVibes?: string[];
  /** Shallow-merged onto the existing `notificationPrefs`, not replaced wholesale — a settings
   *  screen editing one field must not clobber others it doesn't know about. */
  notificationPrefs?: NotificationPrefs;
  /** Track 37f — merged onto the stored preferences, like `notificationPrefs`. */
  trainingPreferences?: Partial<TrainingPreferences>;
  /** Track 37i — merged onto the stored band settings. */
  bandSettings?: Partial<BandSettings>;
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
  if (patch.cueSoundsEnabled !== undefined) values.cueSoundsEnabled = patch.cueSoundsEnabled;
  if (patch.feedbackPromptEnabled !== undefined) {
    values.feedbackPromptEnabled = patch.feedbackPromptEnabled;
  }
  if (patch.themePreference !== undefined) values.themePreference = patch.themePreference;
  if (patch.spotifyVibes !== undefined) values.spotifyVibes = JSON.stringify(patch.spotifyVibes);
  if (patch.notificationPrefs !== undefined) {
    values.notificationPrefs = JSON.stringify({
      ...current.notificationPrefs,
      ...patch.notificationPrefs,
    });
  }
  if (patch.bandSettings !== undefined) {
    values.bandSettings = JSON.stringify({ ...current.bandSettings, ...patch.bandSettings });
  }
  if (patch.trainingPreferences !== undefined) {
    values.trainingPrefs = JSON.stringify({
      ...current.trainingPreferences,
      ...patch.trainingPreferences,
    });
  }
  db.update(schema.users).set(values).where(eq(schema.users.id, USER_ID)).run();
}

/** Track 37i — rename or recolour one band (the band editor). Merged over what is stored, so a
 *  colour change keeps a custom label and vice versa. */
export function updateBandTension(
  db: Db,
  band: SingleBandId,
  patch: Partial<Pick<BandTension, 'label' | 'color'>>,
  now: string,
): void {
  const current = ensureUser(db, now);
  const next = { ...current.bandTensions, [band]: { ...current.bandTensions[band], ...patch } };
  db.update(schema.users)
    .set({ bandTensions: JSON.stringify(next), updatedAt: now })
    .where(eq(schema.users.id, USER_ID))
    .run();
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

/** Track 37h — the first-launch setup's first step: the disclaimer is acknowledged and setup is
 *  under way, so a relaunch before it finishes resumes it. */
export function beginOnboarding(db: Db, now: string): void {
  ensureUser(db, now);
  db.update(schema.users)
    .set({ hasAcknowledgedDisclaimer: true, onboardingState: 'in_progress', updatedAt: now })
    .where(eq(schema.users.id, USER_ID))
    .run();
}

/** Track 37h — setup finished (or skipped): open Today from now on. */
export function finishOnboarding(db: Db, now: string): void {
  ensureUser(db, now);
  db.update(schema.users)
    .set({ hasAcknowledgedDisclaimer: true, onboardingState: 'done', updatedAt: now })
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

/**
 * Track 37a — replaces the user's limitation choices with `ids` (unknown ids ignored). A choice
 * that was already on keeps its original `since`; a newly turned-on one starts `today`.
 */
export function setLimitationChoices(
  db: Db,
  ids: readonly string[],
  today: string,
  now: string,
): void {
  const current = ensureUser(db, now);
  const sinceById = new Map(current.limitationChoices.map((c) => [c.id, c.since]));
  const next: LimitationChoiceRecord[] = [...new Set(ids)]
    .filter(isLimitationChoiceId)
    .map((id) => ({ id, since: sinceById.get(id) ?? today }));
  db.update(schema.users)
    .set({ limitationChoices: JSON.stringify(next), updatedAt: now })
    .where(eq(schema.users.id, USER_ID))
    .run();
}

/** The user's choices as engine limitations: one per tag a choice filters on (`source: 'user'`,
 *  no expiry). A tag shared by two choices appears once, dated by the earliest of them. */
function limitationsFromChoices(choices: readonly LimitationChoiceRecord[]): EngineLimitation[] {
  const byTag = new Map<EngineLimitation['tag'], EngineLimitation>();
  for (const choice of choices) {
    for (const tag of tagsForLimitationChoices([choice.id])) {
      const existing = byTag.get(tag);
      if (!existing || choice.since < existing.createdAt) {
        byTag.set(tag, { tag, createdAt: choice.since, source: 'user', note: choice.id });
      }
    }
  }
  return [...byTag.values()];
}

export function buildUserProfile(db: Db, today: string): UserProfile {
  const user = ensureUser(db, today);
  return {
    units: user.units,
    weeklyTarget: user.weeklyTarget,
    limitations: [
      ...limitationsFromChoices(user.limitationChoices),
      ...getActiveLimitations(db, today),
    ],
    anchorsAvailable: user.anchorsAvailable,
    disabledExerciseIds: getDisabledExerciseIds(db),
    training: user.trainingPreferences,
    bands: user.bandSettings,
  };
}
