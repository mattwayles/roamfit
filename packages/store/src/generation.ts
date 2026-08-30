/**
 * Bridges the store to the engine's `generateSession`/`generateQuickSession` — builds the
 * `UserState` the engine reads, and (§9.9) applies the Recovery Week transform *before* handing
 * progression states to the engine. See STATUS-3-persistence.md's "Recovery Week wiring plan" for
 * why this can't be a `GenerationRequest` flag: `generateSession`'s own comeback assessment is
 * entirely internal, driven by `userState.history`.
 */
import {
  applyComebackToProgressionStates,
  assessComeback,
  COMEBACK_VOLUME_MULTIPLIER,
  generateSession,
  generateQuickSession,
} from '@roamfit/engine';
import type { EngineClock, GenerationRequest, Rng, SessionPlan, UserState } from '@roamfit/engine';
import type { ExerciseLibrary, FamilyLibrary } from '@roamfit/data';
import type { Db } from './db';
import { buildUserProfile, ensureUser, observeTzId } from './repositories/users';
import { getAllExerciseStates } from './repositories/exerciseState';
import {
  ensureProgressionStatesInitialized,
  getAllProgressionStates,
} from './repositories/progressionState';
import { getHistoryForGeneration } from './repositories/sessions';

export function buildUserState(
  db: Db,
  library: ExerciseLibrary,
  families: FamilyLibrary,
  clock: EngineClock,
): UserState {
  ensureUser(db, clock.today);
  ensureProgressionStatesInitialized(db, families, library.exercises, clock.today);
  const history = getHistoryForGeneration(db);
  return {
    profile: buildUserProfile(db, clock.today),
    exerciseStates: getAllExerciseStates(db),
    progressionStates: getAllProgressionStates(db),
    history,
    hasEverCompletedSession: history.some((h) => h.status === 'completed'),
  };
}

export interface GenerateInput {
  library: ExerciseLibrary;
  families: FamilyLibrary;
  request: GenerationRequest;
  clock: EngineClock;
  rng: Rng;
  utcInstant: string;
  /** §9.9 — an explicit Recovery Week trigger (manual toggle, or the auto-suggest logic in
   *  `stats.ts` deciding "6-8 weeks since the last one"). Applies the exact same
   *  `applyComebackToProgressionStates('week', ...)` transform §9.4 uses for an auto-detected
   *  gap — see the module doc above for why this is a pre-transform rather than a request flag. */
  recoveryWeek?: boolean;
}

export interface GenerateResult {
  plan: SessionPlan;
  /** 'week' either because this was an explicit Recovery Week request, or because
   *  `assessComeback` independently detects a ≥7-day gap from the same history the engine used
   *  internally (a read-only call here, purely to record the fact — `generateSession` already
   *  applied the transform itself in the auto-detected case). 'reset' for a ≥21-day gap. */
  comebackTier: 'none' | 'week' | 'reset';
  recoveryWeekManual: boolean;
}

/** Records the device's current tz_id as a side effect of generation (§8.3/§9.3 travel
 *  detection) — generation is the one moment we're guaranteed to see the device's live clock. */
export function generate(db: Db, input: GenerateInput): GenerateResult {
  observeTzId(db, input.clock.tzId, input.utcInstant, input.clock.today);

  let userState = buildUserState(db, input.library, input.families, input.clock);

  const autoComeback = assessComeback(userState.history, input.clock.today);
  const recoveryWeek = Boolean(input.recoveryWeek);
  if (recoveryWeek) {
    const regressed = applyComebackToProgressionStates(
      userState.progressionStates,
      input.families.families,
      input.library.exercises,
      'week',
    );
    userState = { ...userState, progressionStates: regressed };
  }

  let plan = input.request.quickSession
    ? generateQuickSession({
        library: input.library,
        families: input.families,
        userState,
        focus: input.request.focus,
        clock: input.clock,
        rng: input.rng,
      })
    : generateSession({
        library: input.library,
        families: input.families,
        userState,
        request: input.request,
        clock: input.clock,
        rng: input.rng,
      });

  if (recoveryWeek) {
    // The gap-based volume cut lives inside generateSession's own prescription call, gated on
    // its own internal (history-driven) comeback assessment — unreachable from here since the
    // real gap is normally small for a Recovery Week user. Applying the identical documented
    // multiplier post-generation is a deliberate, minimal exception recorded in
    // STATUS-3-persistence.md, not a silent reimplementation of engine prescription logic.
    plan = scaleSessionSets(plan, COMEBACK_VOLUME_MULTIPLIER);
  }

  return {
    plan,
    comebackTier: recoveryWeek ? 'week' : autoComeback.tier,
    recoveryWeekManual: recoveryWeek,
  };
}

function scaleSessionSets(plan: SessionPlan, multiplier: number): SessionPlan {
  const scale = (entries: SessionPlan['main']) =>
    entries.map((e) => ({ ...e, sets: Math.max(1, Math.floor(e.sets * multiplier)) }));
  return {
    ...plan,
    warmup: scale(plan.warmup),
    main: scale(plan.main),
    cooldown: scale(plan.cooldown),
  };
}
