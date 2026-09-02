/**
 * ADR 0012 — "this is too easy, move me up a level", applied immediately to the session in front
 * of the user.
 *
 * Distinct from a swap (§10.6), which says "not this exercise, give me a different one at the
 * same difficulty" and penalises the exercise via `swapAwayCount`. This says "this rung is below
 * me", advances the family's `ProgressionState`, and rewrites the entry to the new rung. The old
 * exercise is not penalised — the user has no complaint about it, they have outgrown it.
 *
 * Invariant 2 holds: every number written here comes from the engine (`levelUpForTooEasy`,
 * `resolveLadderSlot`, `prescribeLaddered`). This module decides nothing about training, it only
 * persists what the engine returned.
 */
import { eq } from 'drizzle-orm';
import {
  applyHardFilters,
  findFamily,
  levelUpForTooEasy,
  prescribeLaddered,
  resolveLadderSlot,
} from '@roamfit/engine';
import type { BandId, EngineClock, Rng, SessionEntry as EngineSessionEntry } from '@roamfit/engine';
import type { ExerciseLibrary, FamilyLibrary, ProgressionFamilyId } from '@roamfit/data';
import type { Db } from './db';
import * as schema from './schema';
import { getSession } from './repositories/sessions';
import { logSignalEvent } from './repositories/signals';
import { buildUserProfile } from './repositories/users';
import { getAllProgressionStates, upsertProgressionState } from './repositories/progressionState';

export type LevelUpOutcome =
  /** Advanced. `exerciseName` is the new rung's exercise, for the confirmation copy. */
  | { status: 'levelled_up'; exerciseId: string; exerciseName: string; levelId: string }
  /** Already at the top of this ladder — §6.7 Mastery territory, not a failure. */
  | { status: 'at_max' }
  /** This entry isn't laddered (an accessory, warmup or cooldown), so there is no level to move. */
  | { status: 'not_laddered' }
  /** Advanced the ladder, but every exercise at the new rung is hard-filtered out for this user
   *  (anchor or limitation), so the plan is unchanged. Progression state is NOT written in this
   *  case — moving someone to a rung they cannot perform would strand them there. */
  | { status: 'no_eligible_exercise' };

export interface LevelUpInput {
  entryId: string;
  library: ExerciseLibrary;
  families: FamilyLibrary;
  clock: EngineClock;
  rng: Rng;
}

export function levelUpEntry(db: Db, input: LevelUpInput, now: string): LevelUpOutcome {
  const { entryId, library, families, clock, rng } = input;

  const entry = db
    .select()
    .from(schema.sessionEntries)
    .where(eq(schema.sessionEntries.id, entryId))
    .all()[0];
  if (!entry) return { status: 'not_laddered' };

  const familyId = entry.progressionFamilyId as ProgressionFamilyId | null;
  if (!familyId) return { status: 'not_laddered' };
  const family = findFamily(families.families, familyId);
  if (!family) return { status: 'not_laddered' };

  const states = getAllProgressionStates(db);
  const state = states[familyId];
  if (!state) return { status: 'not_laddered' };

  const advanced = levelUpForTooEasy(state, family, library.exercises);
  if (!advanced) return { status: 'at_max' };

  // Resolve the new rung against the user's actual hard filters *before* committing the level
  // change, so a rung they cannot perform is a no-op rather than a trap.
  const profile = buildUserProfile(db, clock.today);
  const pool = applyHardFilters({
    library: library.exercises,
    request: { equipmentPreference: 'any' },
    anchorsAvailable: profile.anchorsAvailable,
    limitations: profile.limitations,
    today: clock.today,
  });
  const resolved = resolveLadderSlot({
    familyId,
    families: families.families,
    library: library.exercises,
    progressionStates: { ...states, [familyId]: advanced.state },
    hardFilteredPool: pool,
    rng,
  });
  // `resolveLadderSlot` walks *down* when a rung is unavailable, which is right during generation
  // but wrong here: silently handing back a lower rung than the one just unlocked would look like
  // the button did nothing, or worse, moved the user backwards.
  if (!resolved || resolved.substitutedFrom) return { status: 'no_eligible_exercise' };

  upsertProgressionState(db, advanced.state, now);

  const prescription: EngineSessionEntry = prescribeLaddered({
    exercise: resolved.exercise,
    familyId,
    levelId: advanced.state.levelId,
    micro: advanced.state.micro,
    requestedEffort: entry.effort,
    // A level-up is not a recovery-treated entry; the §5.2 48h drop that may have applied to the
    // old rung was about the old exercise's muscles and is re-derived at next generation.
    recoveryTreatment: false,
  });

  const fromExerciseId = entry.exerciseId;
  db.update(schema.sessionEntries)
    .set({
      exerciseId: prescription.exerciseId,
      band: prescription.band as BandId | null,
      sets: prescription.sets,
      repTarget: prescription.repTarget ?? null,
      durationSec: prescription.durationSec ?? null,
      restSec: prescription.restSec,
      tempoSec: prescription.tempoSec,
      notes: prescription.notes ?? null,
      effort: prescription.effort,
      progressionFamilyId: prescription.progressionFamilyId,
      progressionLevelIdAtTime: prescription.progressionLevelIdAtTime,
      pattern: prescription.pattern,
      anchorClass: prescription.anchorClass,
      unilateral: prescription.unilateral,
      estimatedSec: prescription.estimatedSec,
    })
    .where(eq(schema.sessionEntries.id, entryId))
    .run();

  logSignalEvent(db, {
    sessionId: entry.sessionId,
    type: 'level_up_too_easy',
    payload: {
      entryId,
      familyId,
      fromLevelId: state.levelId,
      toLevelId: advanced.state.levelId,
      fromExerciseId,
      toExerciseId: prescription.exerciseId,
    },
    utcInstant: now,
    localDate: getSession(db, entry.sessionId)?.localDate ?? now.slice(0, 10),
  });

  return {
    status: 'levelled_up',
    exerciseId: resolved.exercise.id,
    exerciseName: resolved.exercise.name,
    levelId: advanced.state.levelId,
  };
}
