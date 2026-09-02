/**
 * @roamfit/engine — pure TypeScript generation + progression engine.
 *
 * Invariant (CLAUDE.md #2, wave-01a-skeleton brief): this package must never import from
 * `app/` or from `react-native`. It has no I/O and no network calls, so it is fully
 * unit-testable in plain node. Enforced by `tools/check-engine-purity.js`.
 *
 * §5.1: a pure function from (library, user state, request) to a session plan.
 */
export * from './types';
export { createRng, seedFromString } from './rng';
export { daysBetween, addDays } from './dates';
export { ENGINE_VERSION } from './version';
export { generateSession, generateQuickSession } from './pipeline';
export {
  applyHardFilters,
  DEFAULT_ANCHORS_AVAILABLE,
  effortCapForExercise,
} from './filters/hardFilters';
export type { HardFilterInput } from './filters/hardFilters';
// §14.1.7 muscle-balance OVER-WORKED flag — the same 1.5x-trailing-mean rule §5.2 uses at
// generation time, so the dashboard's flag and the engine's own recommendation stay consistent.
// The dashboard classifies over an already-aggregated `Record<muscle, number>` (rolled-up stats,
// §11.3 — no history rescan), so only the threshold constant is shared, not `overWorkedMuscles`
// itself (which takes raw `SessionHistoryRecord[]`).
export { OVER_WORKED_MULTIPLIER } from './selection/constants';

// --------------------------------------------------------------------------------------------
// Wave 3 wiring surface — completion-time progression updates (§6.3/§6.7) and the comeback /
// §9.9 Recovery Week code path. Not used by generation itself (the pipeline calls these
// internally for its own gap detection); re-exported so the persistence layer can (a) apply the
// same state transition at session completion, and (b) drive an explicitly-triggered Recovery
// Week through the identical `applyComebackToProgressionStates('week', ...)` transform rather
// than a parallel implementation.
export { applySessionResult, levelUpForTooEasy } from './progression/rules';
export type { ProgressionEvent, ApplySessionResult } from './progression/rules';
export type { SessionPerformance } from './progression/rules.types';
export { assessComeback, applyComebackToProgressionStates } from './progression/comeback';
export type { ComebackAssessment, ComebackTier } from './progression/comeback';
export { COMEBACK_VOLUME_MULTIPLIER, COMEBACK_WEEK_GAP_DAYS } from './progression/constants';
// Cold-start (§6.5): the store needs these to seed a brand-new user's progression_state rows
// before any generation has ever run — the engine's own pipeline only ever *reads* an existing
// ProgressionState, it never fabricates the first one.
export { calibrationStartLevel } from './progression/ladder';
export { defaultMicroForExercise, microStepsToNextLevel } from './progression/micro';

// Wave 5 wiring surface — §14.1.4 progression board / §6.4 Next Unlock. Read-only ladder lookups
// the UI needs to render every family's level badge, mastery state, and next-unlock exercise
// without re-deriving any of it by hand (invariant 2: the engine decides, the UI never guesses
// at a level_id's position or which exercise sits at a level).
export {
  findFamily,
  levelById,
  exerciseForLevel,
  exercisesForLevel,
  isMaxLevel,
  levelOrdinal,
  nextLevel,
} from './progression/ladder';

// Wave 4b wiring surface — §10.6 mid-workout swap. `app/` calls this to get 3-5 same-slot,
// same-level, filter-respecting alternatives; it must never rank/filter candidates itself.
export { alternativesForSlot, buildSwapReplacementEntry } from './selection/swap';
export type { SwapSlotRequest, SwapAlternative } from './selection/swap';

// Wave 4b wiring surface — §10.3 approval-time "add exercise." The store has no prescription
// logic of its own (invariant 2: "the engine decides"), so adding a user-picked exercise to a
// plan still has to go through the engine's own accessory-prescription formula rather than have
// `app/`/`packages/store` invent sets/reps/rest by hand.
export { prescribeAccessory, prescribeWarmupCooldown } from './prescription/prescribe';
export type { PrescribeAccessoryInput } from './prescription/prescribe';

// Wave 6c wiring surface — §7.3 "validate anyway." The LLM proxy (a plain node Cloud Function,
// not `app/`) depends on this package purely for these pure validators — never for exercise
// selection, which stays the engine pipeline's job alone (invariant 2).
export {
  validateIntakeOutput,
  validateCoachVoiceOutput,
  validateDistillationOutput,
  isKnownAnchor,
} from './llm/validate';
export type {
  ValidationResult,
  IntakeLlmOutput,
  CoachVoiceLlmOutput,
  DistillationLlmOutput,
} from './llm/validate';
