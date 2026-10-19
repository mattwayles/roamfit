/**
 * Track 38 — turns facts into saved badges. The engine decides what is earned
 * (`evaluateBadges`); this file gathers facts, saves the result, and keeps badge trouble from
 * ever reaching the workout: both entry points swallow errors and log a `badge_error` signal.
 */
import type { ExerciseLibrary, FamilyLibrary } from '@roamfit/data';
import { evaluateBadges } from '@roamfit/engine';
import type { BadgeDefinition } from '@roamfit/engine';
import type { Db } from './db';
import { localDateForInstant } from './dates';
import { buildBadgeFacts } from './badgeFacts';
import { getEarnedBadgeIds, insertEarnedBadges } from './repositories/badges';
import { logSignalEvent } from './repositories/signals';

export interface AwardBadgesInput {
  library: ExerciseLibrary;
  families: FamilyLibrary;
  /** The session being completed; null for a retroactive (backfill) award. */
  sessionId: string | null;
  localDate: string;
  retroactive: boolean;
}

/** Gathers facts, evaluates, saves what is newly earned, and returns it. Throws on failure; use
 *  `awardBadgesSafely` / `backfillBadges` where a failure must not propagate. */
export function awardBadges(db: Db, input: AwardBadgesInput, now: string): BadgeDefinition[] {
  const facts = buildBadgeFacts(db, input.library, input.families);
  const earned = evaluateBadges(facts, getEarnedBadgeIds(db));
  if (earned.length === 0) return [];
  const inserted = new Set(
    insertEarnedBadges(
      db,
      earned.map((def) => ({
        badgeId: def.id,
        localDate: input.localDate,
        sessionId: input.sessionId,
        retroactive: input.retroactive,
        payload: { value: def.measure(facts) },
      })),
      now,
    ),
  );
  return earned.filter((def) => inserted.has(def.id));
}

/** `awardBadges` that can never throw. Runs in its own savepoint so a half-finished award rolls
 *  back cleanly without touching the surrounding transaction; the failure is logged. */
export function awardBadgesSafely(
  db: Db,
  input: AwardBadgesInput,
  now: string,
  stage: 'completion' | 'backfill',
): BadgeDefinition[] {
  try {
    return db.transaction((tx) => awardBadges(tx as unknown as Db, input, now));
  } catch (error) {
    try {
      logSignalEvent(db, {
        sessionId: input.sessionId,
        type: 'badge_error',
        payload: { stage, message: error instanceof Error ? error.message : String(error) },
        utcInstant: now,
        localDate: input.localDate,
      });
    } catch {
      // Logging is best effort: nothing about badges may break the caller.
    }
    return [];
  }
}

/**
 * Awards, silently, every badge the user already qualifies for and doesn't hold: `retroactive`,
 * no session. Idempotent, so it is safe on every launch, and adding catalog entries later
 * backfills them the same way. Returns the ids it saved.
 */
export function backfillBadges(
  db: Db,
  library: ExerciseLibrary,
  families: FamilyLibrary,
  now: string,
  tzId?: string,
): string[] {
  const localDate = localDateForInstant(
    now,
    tzId ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  return awardBadgesSafely(
    db,
    { library, families, sessionId: null, localDate, retroactive: true },
    now,
    'backfill',
  ).map((b) => b.id);
}
