/**
 * §4.5 User Progression State repository — per user × family, `level_id` is a stable id, never a
 * positional index (invariant 5).
 */
import { eq, and } from 'drizzle-orm';
import {
  calibrationStartLevel,
  defaultMicroForExercise,
  findFamily,
  exerciseForLevel,
} from '@roamfit/engine';
import type { ProgressionState as EngineProgressionState } from '@roamfit/engine';
import type { Exercise, FamilyLibrary, ProgressionFamilyId } from '@roamfit/data';
import type { Db } from '../db';
import { schema } from '../db';

const USER_ID = 'local';

function rowToState(row: typeof schema.progressionState.$inferSelect): EngineProgressionState {
  return {
    familyId: row.familyId as ProgressionFamilyId,
    levelId: row.levelId,
    micro: JSON.parse(row.micro),
    calibrating: row.calibrating,
    consecutiveHits: row.consecutiveHits,
    consecutiveMisses: row.consecutiveMisses,
    lastLevelChangeAt: row.lastLevelChangeAt,
  };
}

export function getProgressionState(db: Db, familyId: string): EngineProgressionState | null {
  const rows = db
    .select()
    .from(schema.progressionState)
    .where(
      and(
        eq(schema.progressionState.userId, USER_ID),
        eq(schema.progressionState.familyId, familyId),
      ),
    )
    .all();
  return rows.length > 0 ? rowToState(rows[0]) : null;
}

export function getAllProgressionStates(
  db: Db,
): Record<ProgressionFamilyId, EngineProgressionState> {
  const rows = db
    .select()
    .from(schema.progressionState)
    .where(eq(schema.progressionState.userId, USER_ID))
    .all();
  const out = {} as Record<ProgressionFamilyId, EngineProgressionState>;
  for (const row of rows) out[row.familyId as ProgressionFamilyId] = rowToState(row);
  return out;
}

/** §6.5 cold start — seeds one row per family at ~30th percentile of its ladder, calibrating.
 *  Idempotent: only inserts families that don't already have a row. Call before the first-ever
 *  generation for a user (and safe to call on every generation after — a no-op once seeded). */
export function ensureProgressionStatesInitialized(
  db: Db,
  families: FamilyLibrary,
  library: readonly Exercise[],
  now: string,
): void {
  const existing = new Set(
    db
      .select()
      .from(schema.progressionState)
      .where(eq(schema.progressionState.userId, USER_ID))
      .all()
      .map((r) => r.familyId),
  );
  for (const family of families.families) {
    if (existing.has(family.id)) continue;
    const startLevel = calibrationStartLevel(family);
    const exercise = library.find((e) => e.id === startLevel.anchor_exercise_id);
    const micro = exercise
      ? defaultMicroForExercise(exercise)
      : { repTarget: 10, band: null, tempoSec: 3, restSec: 45, sets: 3 };
    db.insert(schema.progressionState)
      .values({
        userId: USER_ID,
        familyId: family.id,
        levelId: startLevel.level_id,
        micro: JSON.stringify(micro),
        calibrating: true,
        updatedAt: now,
      })
      .run();
  }
}

/** Admin setting: reset every ladder's session counters back to zero without moving its rung.
 *  `level_id` (and `calibrating`) are left untouched (invariant 5) — only `consecutiveHits`,
 *  `consecutiveMisses`, and `micro` (re-seeded fresh for the current level's anchor exercise, same
 *  as entering that level for the first time) are reset. */
export function resetAllProgressionSessions(
  db: Db,
  families: FamilyLibrary,
  library: readonly Exercise[],
  now: string,
): void {
  const states = getAllProgressionStates(db);
  for (const state of Object.values(states)) {
    const family = findFamily(families.families, state.familyId);
    const exercise = family ? exerciseForLevel(family, state.levelId, library) : undefined;
    const micro = exercise ? defaultMicroForExercise(exercise) : state.micro;
    upsertProgressionState(db, { ...state, micro, consecutiveHits: 0, consecutiveMisses: 0 }, now);
  }
}

export function upsertProgressionState(db: Db, state: EngineProgressionState, now: string): void {
  const values = {
    userId: USER_ID,
    familyId: state.familyId,
    levelId: state.levelId,
    micro: JSON.stringify(state.micro),
    calibrating: state.calibrating,
    consecutiveHits: state.consecutiveHits,
    consecutiveMisses: state.consecutiveMisses,
    lastLevelChangeAt: state.lastLevelChangeAt,
    updatedAt: now,
  };
  const existing = db
    .select()
    .from(schema.progressionState)
    .where(
      and(
        eq(schema.progressionState.userId, USER_ID),
        eq(schema.progressionState.familyId, state.familyId),
      ),
    )
    .all();
  if (existing.length > 0) {
    db.update(schema.progressionState)
      .set(values)
      .where(
        and(
          eq(schema.progressionState.userId, USER_ID),
          eq(schema.progressionState.familyId, state.familyId),
        ),
      )
      .run();
  } else {
    db.insert(schema.progressionState).values(values).run();
  }
}
