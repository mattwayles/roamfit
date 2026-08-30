/**
 * §5.1 — the pipeline entry point. A pure function from (library, families, user state, request,
 * clock, rng) to a `SessionPlan`. No I/O, no ambient clock, no ambient randomness — everything
 * the stages need is passed in.
 *
 * §9.5 Quick Session and §9.4 comeback are NOT separate code paths: `generateSession` is the one
 * function both call through (see `generateQuickSession` / the comeback handling below), exactly
 * as the wave-02 brief requires.
 */
import type { Exercise, ExerciseLibrary, FamilyLibrary, Focus, Pattern, ProgressionFamilyId } from '@roamfit/data';
import { applyHardFilters } from './filters/hardFilters';
import { buildFocusTemplate, buildQuickSessionTemplate } from './template/focusTemplate';
import type { TemplateSlot } from './template/focusTemplate';
import { selectMain } from './selection/mainSelection';
import { selectWarmupCooldown } from './selection/warmupCooldown';
import { recentHardMuscles } from './selection/volume';
import { RECOVERY_WINDOW_DAYS } from './selection/constants';
import { resolveLadderSlot } from './progression/resolveSlot';
import { levelOrdinal } from './progression/ladder';
import { assessComeback, applyComebackToProgressionStates } from './progression/comeback';
import {
  prescribeAccessory,
  prescribeLaddered,
  prescribeWarmupCooldown,
} from './prescription/prescribe';
import { fitMainEntries } from './timefit/fitSession';
import type { SlotEntry } from './timefit/fitSession';
import { cooldownMinutes, warmupMinutes } from './timefit/formulas';
import { composeExplanation } from './explain/explain';
import type { LevelUpFact, PatternGapFact, SubstitutionFact } from './explain/explain';
import { ENGINE_VERSION } from './version';
import type { EngineClock, GenerationRequest, PatternGapNote, Rng, SessionEntry, SessionPlan, UserState } from './types';

/** The 8 v1 laddered families (§6.6), keyed by the pattern they cover. A template slot whose
 *  single pattern is a key here is resolved from `ProgressionState`, not `selectMain`. */
const LADDERED_PATTERN_TO_FAMILY: Partial<Record<Pattern, ProgressionFamilyId>> = {
  horizontal_push: 'horizontal_push',
  horizontal_pull: 'horizontal_pull',
  vertical_push: 'vertical_push',
  vertical_pull: 'vertical_pull',
  squat: 'squat',
  hinge: 'hinge',
  lunge: 'lunge',
  anti_extension: 'anti_extension',
};

function isLadderedSlot(slot: TemplateSlot): ProgressionFamilyId | undefined {
  if (slot.isFinisher || slot.patterns.length !== 1) return undefined;
  return LADDERED_PATTERN_TO_FAMILY[slot.patterns[0]];
}

export interface GenerateSessionInput {
  library: ExerciseLibrary;
  families: FamilyLibrary;
  userState: UserState;
  request: GenerationRequest;
  clock: EngineClock;
  rng: Rng;
}

export function generateSession(input: GenerateSessionInput): SessionPlan {
  const { library, families, request, clock, rng } = input;
  const allExercises = library.exercises;

  // §9.5 Quick Session overrides target/effort; everything downstream is identical.
  const isQuick = Boolean(request.quickSession);
  const focus: Focus = request.focus;
  const effort = isQuick ? 'normal' : request.effort;
  const targetMinutes = isQuick ? 7 : request.targetMinutes;
  const equipmentPreference = request.equipmentPreference ?? 'any';

  // §9.4 comeback — a whole-user gap check, applied identically whether it's auto-detected here
  // or (§9.9) a caller explicitly requesting the same 'week' treatment via a Recovery Week flag
  // is layered on by a future wave; the transform itself is this one function either way.
  const comeback = assessComeback(input.userState.history, clock.today);
  const progressionStates =
    comeback.tier === 'none'
      ? input.userState.progressionStates
      : applyComebackToProgressionStates(
          input.userState.progressionStates,
          families.families,
          allExercises,
          comeback.tier,
        );
  const userState: UserState = { ...input.userState, progressionStates };
  const setsMultiplier = comeback.volumeMultiplier;

  // §5.1 step 1 — hard filters, before anything else sees the pool.
  const pool = applyHardFilters({
    library: allExercises,
    request: { equipmentPreference },
    anchorsAvailable: userState.profile.anchorsAvailable,
    limitations: userState.profile.limitations,
    today: clock.today,
  });
  const poolIgnoringEquipment = applyHardFilters({
    library: allExercises,
    request: { equipmentPreference: 'any' },
    anchorsAvailable: userState.profile.anchorsAvailable,
    limitations: userState.profile.limitations,
    today: clock.today,
  });

  // §5.1 step 2 — template.
  const template = isQuick
    ? buildQuickSessionTemplate({ focus, targetMinutes, effort, library: allExercises, history: userState.history })
    : buildFocusTemplate({ focus, targetMinutes, effort, library: allExercises, history: userState.history });

  const recoveryMuscles = recentHardMuscles(userState.history, pool, clock.today, RECOVERY_WINDOW_DAYS);

  // Split slots: laddered (§6) vs. accessory (§5.2 selectMain) vs. finisher (accessory, tier=fill).
  const ladderSlots: { slot: TemplateSlot; familyId: ProgressionFamilyId }[] = [];
  const accessorySlots: TemplateSlot[] = [];
  for (const slot of template.slots) {
    const familyId = isLadderedSlot(slot);
    if (familyId) ladderSlots.push({ slot, familyId });
    else accessorySlots.push(slot);
  }

  // §5.1 step 3 — selection, for the accessory slots only (§5.2's variety machinery; laddered
  // slots are resolved by progression state directly, see STATUS-2-engine.md).
  const mainSelection =
    accessorySlots.length > 0
      ? selectMain({
          slots: accessorySlots,
          pool,
          poolIgnoringEquipment,
          userState,
          today: clock.today,
          rng,
          focus,
          equipmentPreference,
        })
      : { picks: [], patternGaps: [] };

  const patternGaps: PatternGapNote[] = [...mainSelection.patternGaps];
  const substitutions: SubstitutionFact[] = [];
  const levelUps: LevelUpFact[] = [];
  const noveltyNames = new Set<string>();

  const mostRecentSessionDate = [...userState.history]
    .reverse()
    .find((s) => s.status !== 'discarded')?.localDate;

  // §5.1 step 4 (progression) + step 5 (prescription) for laddered slots.
  const entriesBySlotId = new Map<string, SessionEntry>();
  for (const { slot, familyId } of ladderSlots) {
    const resolved = resolveLadderSlot({
      familyId,
      families: families.families,
      library: allExercises,
      progressionStates: userState.progressionStates,
      hardFilteredPool: pool,
    });
    if (!resolved) {
      if (slot.required) {
        patternGaps.push({ pattern: slot.patterns[0], resolution: 'stated_imbalance' });
      }
      continue;
    }
    const touchesRecovery = resolved.exercise.primary.some((m) => recoveryMuscles.has(m));
    const entry = prescribeLaddered({
      exercise: resolved.exercise,
      familyId,
      levelId: resolved.state.levelId,
      micro: resolved.state.micro,
      requestedEffort: effort,
      recoveryTreatment: touchesRecovery,
      setsMultiplier,
      substitutedFor: resolved.substitutedFrom
        ? allExercises.find((e) => e.id === resolved.substitutedFrom!.exerciseId)?.id
        : undefined,
    });
    entriesBySlotId.set(slot.id, entry);

    if (resolved.substitutedFrom) {
      const fromEx = allExercises.find((e) => e.id === resolved.substitutedFrom!.exerciseId);
      substitutions.push({ fromName: fromEx?.name ?? resolved.substitutedFrom.exerciseId, toName: resolved.exercise.name });
    }
    if (resolved.state.lastLevelChangeAt && resolved.state.lastLevelChangeAt === mostRecentSessionDate) {
      const family = families.families.find((f) => f.id === familyId)!;
      const { n, of } = levelOrdinal(family, resolved.state.levelId);
      levelUps.push({ exerciseName: resolved.exercise.name, levelN: n, levelOf: of });
    }
    if ((userState.exerciseStates[resolved.exercise.id]?.sessionsPerformed ?? 0) === 0) {
      noveltyNames.add(resolved.exercise.name);
    }
  }

  // §5.1 step 5 for accessory slots.
  for (const pick of mainSelection.picks) {
    const slot = accessorySlots.find((s) => s.id === pick.slotId)!;
    const entry = prescribeAccessory({
      exercise: pick.exercise,
      requestedEffort: effort,
      recoveryTreatment: pick.recoveryTreatment,
      isFinisherAmrap: Boolean(slot.isFinisher),
      bandRelaxedForPatternGap: pick.bandRelaxedForPatternGap,
      setsMultiplier,
    });
    entriesBySlotId.set(pick.slotId, entry);
    if (pick.candidate.isNovel) noveltyNames.add(pick.exercise.name);
  }

  // Warmup + cooldown — always exactly one each (§5.5), for the full template and Quick Session.
  const warmupEx = selectWarmupCooldown({ role: 'warmup', pool, focus, userState, today: clock.today, rng });
  const cooldownEx = selectWarmupCooldown({ role: 'cooldown', pool, focus, userState, today: clock.today, rng });
  const warmupEntries: SessionEntry[] = warmupEx ? [prescribeWarmupCooldown(warmupEx, 'warmup')] : [];
  const cooldownEntries: SessionEntry[] = cooldownEx ? [prescribeWarmupCooldown(cooldownEx, 'cooldown')] : [];
  const warmupSec = warmupEntries.reduce((a, e) => a + e.estimatedSec, 0);
  const cooldownSec = cooldownEntries.reduce((a, e) => a + e.estimatedSec, 0);

  // §5.1 step 6 — time fit, over the slots in template priority order.
  const slotEntries: SlotEntry[] = [];
  for (const slot of template.slots) {
    const entry = entriesBySlotId.get(slot.id);
    if (entry) slotEntries.push({ required: slot.required, entry });
  }
  const fit = fitMainEntries(slotEntries, targetMinutes, warmupSec, cooldownSec);

  // §5.1 step 7 — explain.
  let recoveryMuscleLabel: string | undefined;
  const touchedRecoveryMuscles = new Set<string>();
  for (const e of fit.main) {
    const ex = allExercises.find((x) => x.id === e.exerciseId);
    ex?.primary.forEach((m) => {
      if (recoveryMuscles.has(m)) touchedRecoveryMuscles.add(m);
    });
  }
  if (touchedRecoveryMuscles.size > 0) recoveryMuscleLabel = [...touchedRecoveryMuscles].join(', ');

  const patternGapFacts: PatternGapFact[] = patternGaps.map((g) => ({
    pattern: g.pattern,
    resolution: g.resolution,
  }));

  const explanation = composeExplanation({
    recoveryMuscleLabel,
    levelUps,
    masteryPrChecks: [], // surfaced by Wave 3 at session completion, not generation (§6.7)
    noveltyExerciseNames: [...noveltyNames],
    substitutions,
    patternGaps: patternGapFacts,
    comebackNotice: comeback.notice ?? undefined,
    calibrationFirstSessionNotice: !userState.hasEverCompletedSession,
    balancedAgainst: fit.main[0]?.pattern,
  });

  return {
    focus,
    effort,
    format: 'straight_sets',
    targetMinutes,
    estimatedMinutes: fit.estimatedMinutes,
    warmup: warmupEntries,
    main: fit.main,
    cooldown: cooldownEntries,
    explanation,
    patternGaps,
    anchorsSnapshot: userState.profile.anchorsAvailable,
    engineVersion: ENGINE_VERSION,
    generatedAtLocalDate: clock.today,
  };
}

/** §9.5 — same pipeline, minimal template + fixed ~7min budget + `normal` effort. */
export function generateQuickSession(
  input: Omit<GenerateSessionInput, 'request'> & { focus: Focus },
): SessionPlan {
  return generateSession({
    ...input,
    request: { focus: input.focus, effort: 'normal', targetMinutes: 7, quickSession: true },
  });
}

// Re-export the exercise type for callers that only import from the pipeline module.
export type { Exercise };
