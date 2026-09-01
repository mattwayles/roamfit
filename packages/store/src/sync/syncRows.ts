/**
 * §11.3 sync row projections — the raw, `updated_at`-carrying shape of each table
 * `firestoreSyncWorker.ts` pushes/pulls, kept separate from the existing repositories
 * (`exerciseState.ts`, `stats.ts`, `sessions.ts`) because those already return
 * engine/UI-shaped views that deliberately omit `updated_at` and `user_id` — exactly the two
 * fields a sync layer needs and nothing else does. Single local user in v1, so `userId` is never
 * part of the synced document shape (it's implicit in which Firestore user-scoped collection the
 * app writes to); the local SQLite side is still one shared `'local'` row/table as everywhere
 * else in this package.
 */
import { and, asc, eq, gt } from 'drizzle-orm';
import type { Db } from '../db';
import { schema } from '../db';

const USER_ID = 'local';

// ------------------------------------------------------------------------------------------
// exercise_state — per (user, exercise), LWW on updated_at.
// ------------------------------------------------------------------------------------------

export type ExerciseStateSyncRow = Omit<typeof schema.exerciseState.$inferSelect, 'userId'>;

export function getAllExerciseStateSyncRows(db: Db): ExerciseStateSyncRow[] {
  return db
    .select()
    .from(schema.exerciseState)
    .where(eq(schema.exerciseState.userId, USER_ID))
    .all();
}

export function getExerciseStateSyncRow(db: Db, exerciseId: string): ExerciseStateSyncRow | null {
  const row = db
    .select()
    .from(schema.exerciseState)
    .where(
      and(
        eq(schema.exerciseState.userId, USER_ID),
        eq(schema.exerciseState.exerciseId, exerciseId),
      ),
    )
    .get();
  return row ?? null;
}

/** Full upsert of a synced row — used only when the LWW comparison says the remote document
 *  won. Never touches EMA formulas or any other derived-value logic (that only applies to a
 *  *local* write); this writes exactly what the remote document said, verbatim. */
export function applyExerciseStateSyncRow(db: Db, row: ExerciseStateSyncRow): void {
  const existing = getExerciseStateSyncRow(db, row.exerciseId);
  if (existing) {
    db.update(schema.exerciseState)
      .set({ ...row })
      .where(
        and(
          eq(schema.exerciseState.userId, USER_ID),
          eq(schema.exerciseState.exerciseId, row.exerciseId),
        ),
      )
      .run();
  } else {
    db.insert(schema.exerciseState)
      .values({ userId: USER_ID, ...row })
      .run();
  }
}

// ------------------------------------------------------------------------------------------
// rolled_up_stats — singleton row, LWW on updated_at.
// ------------------------------------------------------------------------------------------

export type RolledUpStatsSyncRow = Omit<typeof schema.rolledUpStats.$inferSelect, 'userId'>;

export function getRolledUpStatsSyncRow(db: Db): RolledUpStatsSyncRow | null {
  const row = db
    .select()
    .from(schema.rolledUpStats)
    .where(eq(schema.rolledUpStats.userId, USER_ID))
    .get();
  return row ?? null;
}

export function applyRolledUpStatsSyncRow(db: Db, row: RolledUpStatsSyncRow): void {
  const existing = getRolledUpStatsSyncRow(db);
  if (existing) {
    db.update(schema.rolledUpStats)
      .set({ ...row })
      .where(eq(schema.rolledUpStats.userId, USER_ID))
      .run();
  } else {
    db.insert(schema.rolledUpStats)
      .values({ userId: USER_ID, ...row })
      .run();
  }
}

// ------------------------------------------------------------------------------------------
// sessions — append-only, push-only (§11.3: "sessions are append-only, so conflicts are rare").
// Single local writer in v1, so this is a one-way watermark push, not an LWW pull/merge.
// ------------------------------------------------------------------------------------------

export type SessionSyncRow = typeof schema.sessions.$inferSelect;

/** Completed sessions with `updated_at` strictly after the watermark, oldest first — so a sync
 *  pass that's interrupted partway through can safely resume from the last one it actually
 *  finished pushing. `sinceUpdatedAt: null` means "everything" (first sync). */
export function getSessionsToPush(db: Db, sinceUpdatedAt: string | null): SessionSyncRow[] {
  const base = and(
    eq(schema.sessions.userId, USER_ID),
    eq(schema.sessions.status, 'completed'),
    sinceUpdatedAt !== null ? gt(schema.sessions.updatedAt, sinceUpdatedAt) : undefined,
  );
  return db
    .select()
    .from(schema.sessions)
    .where(base)
    .orderBy(asc(schema.sessions.updatedAt))
    .all();
}
