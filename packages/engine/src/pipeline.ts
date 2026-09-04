/**
 * §5.1 — the pipeline entry point. A pure function from (library, families, user state, request,
 * clock, rng) to a `SessionPlan`. No I/O, no ambient clock, no ambient randomness — everything
 * the stages need is passed in.
 *
 * §9.5 Quick Session and §9.4 comeback are NOT separate code paths: `generateSession` is the one
 * function both call through (see `generateQuickSession` / the comeback handling below), exactly
 * as the wave-02 brief requires.
 */
import type {
  Exercise,
  ExerciseLibrary,
  FamilyLibrary,
  Focus,
  Pattern,
  ProgressionFamilyId,
} from '@roamfit/data';
import { applyHardFilters } from './filters/hardFilters';
import {
  buildFocusTemplate,
  buildQuickSessionTemplate,
  accessoryRotationOffset,
  expandOptionalSlots,
} from './template/focusTemplate';
import type { TemplateSlot } from './template/focusTemplate';
import { selectMain } from './selection/mainSelection';
import type { SelectedMain } from './selection/mainSelection';
import { selectWarmupCooldown, selectWarmupCooldownGroup } from './selection/warmupCooldown';
import { recentHardMuscles } from './selection/volume';
import { RECOVERY_WINDOW_DAYS } from './selection/constants';
import { resolveLadderSlot } from './progression/resolveSlot';
import type { ResolvedLadderSlot } from './progression/resolveSlot';
import { levelOrdinal } from './progression/ladder';
import { assessComeback, applyComebackToProgressionStates } from './progression/comeback';
import {
  prescribeAccessory,
  prescribeLaddered,
  prescribeWarmupCooldown,
} from './prescription/prescribe';
import { fitMainEntries } from './timefit/fitSession';
import type { SlotEntry } from './timefit/fitSession';
import {
  cooldownMinutes,
  MINIMUM_SUPPORTED_TARGET_MINUTES,
  longSessionSetsMultiplier,
  mainExerciseCountRange,
  warmupMinutes,
} from './timefit/formulas';
import { composeExplanation } from './explain/explain';
import type { LevelUpFact, PatternGapFact, SubstitutionFact } from './explain/explain';
import { ENGINE_VERSION } from './version';
import type {
  EngineClock,
  GenerationRequest,
  PatternGapNote,
  Rng,
  SessionEntry,
  SessionPlan,
  TimeBudgetDeviation,
  UserState,
} from './types';

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

  // §9.5 Quick Session overrides target/difficulty; everything downstream is identical.
  const isQuick = Boolean(request.quickSession);
  const focus: Focus = request.focus;
  const difficulty = isQuick ? 'medium' : request.difficulty;
  // ADR 0002 — the general pipeline's warmup/cooldown-minutes budget is internally inconsistent
  // below 15 minutes (the 3min floor on each alone consumes 6 of a 10-minute request before any
  // main work). Clamp up to the documented minimum; Quick Session's own fixed ~7min path is
  // unaffected (it doesn't use this budget at all).
  const requestedTargetMinutes = isQuick ? 7 : request.targetMinutes;
  const targetMinutes = isQuick
    ? requestedTargetMinutes
    : Math.max(requestedTargetMinutes, MINIMUM_SUPPORTED_TARGET_MINUTES);
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
  // §9.4's comeback cut and ADR 0013's long-session volume are the same lever pulled in opposite
  // directions, so they compose rather than override: a comeback session at a 90-minute target is
  // still lighter than a normal one at that length.
  const setsMultiplier = comeback.volumeMultiplier * longSessionSetsMultiplier(targetMinutes);

  // §5.1 step 1 — hard filters, before anything else sees the pool.
  const disabledExerciseIds = new Set(userState.profile.disabledExerciseIds);
  const pool = applyHardFilters({
    library: allExercises,
    request: { equipmentPreference },
    anchorsAvailable: userState.profile.anchorsAvailable,
    limitations: userState.profile.limitations,
    disabledExerciseIds,
    today: clock.today,
  });
  const poolIgnoringEquipment = applyHardFilters({
    library: allExercises,
    request: { equipmentPreference: 'any' },
    anchorsAvailable: userState.profile.anchorsAvailable,
    limitations: userState.profile.limitations,
    disabledExerciseIds,
    today: clock.today,
  });

  // §5.1 step 2 — template. Non-quick sessions get extra optional accessory slots appended (up
  // to §5.6's exercise-count-sanity max for this target) so time fit (step 6) has enough supply
  // to actually FILL a long budget rather than stopping once the static slot list runs out —
  // see STATUS-2-engine.md's time-fit correction. Quick Session stays deliberately minimal.
  const baseTemplate = isQuick
    ? buildQuickSessionTemplate({
        focus,
        targetMinutes,
        difficulty,
        library: allExercises,
        history: userState.history,
      })
    : buildFocusTemplate({
        focus,
        targetMinutes,
        difficulty,
        library: allExercises,
        history: userState.history,
      });
  const template = isQuick
    ? baseTemplate
    : expandOptionalSlots(
        baseTemplate,
        focus,
        mainExerciseCountRange(targetMinutes)[1],
        accessoryRotationOffset(userState.history, focus),
      );

  const recoveryMuscles = recentHardMuscles(
    userState.history,
    pool,
    clock.today,
    RECOVERY_WINDOW_DAYS,
  );

  // Split slots: laddered (§6) vs. accessory (§5.2 selectMain) vs. finisher (accessory, tier=fill).
  const ladderSlots: { slot: TemplateSlot; familyId: ProgressionFamilyId }[] = [];
  const accessorySlots: TemplateSlot[] = [];
  for (const slot of template.slots) {
    const familyId = isLadderedSlot(slot);
    if (familyId) ladderSlots.push({ slot, familyId });
    else accessorySlots.push(slot);
  }

  // §5.1 step 3 — selection, for the accessory slots only (§5.2's variety machinery, including
  // the extra filler slots above — every §5.2 rule, band/preferred/favorites ratios included,
  // still applies across the whole accessory set). Laddered slots are resolved by progression
  // state directly, see STATUS-2-engine.md.
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
          requestedDifficulty: difficulty,
        })
      : { picks: [], patternGaps: [] };

  const patternGaps: PatternGapNote[] = [...mainSelection.patternGaps];
  const substitutions: SubstitutionFact[] = [];
  const levelUps: LevelUpFact[] = [];
  const noveltyNames = new Set<string>();

  // TRAINED recency (ADR 0011) — the last session the user actually did. Compared against
  // `lastLevelChangeAt` below to decide whether a level-up is news, so an abandoned session must
  // not qualify: nobody levelled up by quitting.
  const lastTrainedSession = [...userState.history].reverse().find((s) => s.status !== 'discarded');
  const mostRecentSessionDate = lastTrainedSession?.localDate;

  // SEEN recency (ADR 0010 + ADR 0011) — what the generator last put in front of the user,
  // abandoned sessions included, so a level's sibling set rotates rather than re-offering the
  // exercise they just walked away from.
  const lastSeenSession = userState.history[userState.history.length - 1];
  const recentExerciseIds = new Set(lastSeenSession?.entries.map((e) => e.exerciseId) ?? []);

  // §5.1 step 4 — progression: resolve each laddered slot to a concrete exercise ONCE (this
  // does not depend on the sets multiplier, so it isn't repeated by the corrective pass below).
  const ladderResolutions: {
    slot: TemplateSlot;
    familyId: ProgressionFamilyId;
    resolved: ResolvedLadderSlot;
  }[] = [];
  for (const { slot, familyId } of ladderSlots) {
    const resolved = resolveLadderSlot({
      familyId,
      families: families.families,
      library: allExercises,
      progressionStates: userState.progressionStates,
      hardFilteredPool: pool,
      difficulty,
      rng,
      recentExerciseIds,
    });
    if (!resolved) {
      if (slot.required) {
        patternGaps.push({ pattern: slot.patterns[0], resolution: 'stated_imbalance' });
      }
      continue;
    }
    ladderResolutions.push({ slot, familyId, resolved });

    if (resolved.substitutedFrom) {
      const fromEx = allExercises.find((e) => e.id === resolved.substitutedFrom!.exerciseId);
      substitutions.push({
        fromName: fromEx?.name ?? resolved.substitutedFrom.exerciseId,
        toName: resolved.exercise.name,
      });
    }
    if (
      resolved.state.lastLevelChangeAt &&
      resolved.state.lastLevelChangeAt === mostRecentSessionDate
    ) {
      const family = families.families.find((f) => f.id === familyId)!;
      const { n, of } = levelOrdinal(family, resolved.state.levelId);
      levelUps.push({ exerciseName: resolved.exercise.name, levelN: n, levelOf: of });
    }
    if ((userState.exerciseStates[resolved.exercise.id]?.sessionsPerformed ?? 0) === 0) {
      noveltyNames.add(resolved.exercise.name);
    }
  }
  for (const pick of mainSelection.picks) {
    if (pick.candidate.isNovel) noveltyNames.add(pick.exercise.name);
  }

  // §5.1 step 5 — prescription, parameterized by the sets multiplier so it can be re-run once
  // with a corrective multiplier if required-only entries alone overshoot the time budget (the
  // short-target case: trim sets via prescription rather than drop a required pattern slot).
  function prescribeEntries(multiplier: number): Map<string, SessionEntry> {
    const map = new Map<string, SessionEntry>();
    for (const { slot, familyId, resolved } of ladderResolutions) {
      const touchesRecovery = resolved.exercise.primary.some((m) => recoveryMuscles.has(m));
      map.set(
        slot.id,
        prescribeLaddered({
          exercise: resolved.exercise,
          familyId,
          levelId: resolved.state.levelId,
          micro: resolved.state.micro,
          requestedDifficulty: difficulty,
          recoveryTreatment: touchesRecovery,
          setsMultiplier: multiplier,
          substitutedFor: resolved.substitutedFrom
            ? allExercises.find((e) => e.id === resolved.substitutedFrom!.exerciseId)?.id
            : undefined,
        }),
      );
    }
    for (const pick of mainSelection.picks as SelectedMain[]) {
      const slot = accessorySlots.find((s) => s.id === pick.slotId)!;
      map.set(
        pick.slotId,
        prescribeAccessory({
          exercise: pick.exercise,
          requestedDifficulty: difficulty,
          recoveryTreatment: pick.recoveryTreatment,
          isFinisherAmrap: Boolean(slot.isFinisher),
          bandRelaxedForPatternGap: pick.bandRelaxedForPatternGap,
          setsMultiplier: multiplier,
        }),
      );
    }
    return map;
  }

  const entriesBySlotId = prescribeEntries(setsMultiplier);

  // Warmup + cooldown. §9.5 Quick Session is explicitly "one warmup ... one cooldown" — keep it
  // to exactly one each. Every other session's §5.6 budget allocates several *minutes* to each
  // (`clamp(round(0.12xT),3,8)` / `clamp(round(0.10xT),3,7)`), which one ~45-90s movement can't
  // fill — this was a real contributor to the time-budget shortfall this change fixes (see
  // STATUS-2-engine.md), so a full session picks as many distinct warmup/cooldown exercises as
  // it takes to approximately fill that allocation. Resolved before the main-budget correction
  // below so that correction can size itself against the *actual* warmup/cooldown time, not the
  // clamp-formula's estimate of it (Quick Session's real overhead is much smaller than the
  // formula assumes).
  //
  // An exercise may be eligible for more than one section (a band row warms the back up and also
  // trains it), so every section after the first has to be told what the session already holds.
  // Without this the same movement can legitimately be drawn twice and the plan reads as a
  // mistake: "Band Row" as the warm-up, "Band Row" as the main set. Main work is chosen first and
  // is never displaced by a warm-up; the cool-down additionally avoids repeating the warm-up,
  // since the mobility drills eligible for both sections are exactly the ones most likely to
  // collide.
  const mainExerciseIds = new Set<string>(
    [...entriesBySlotId.values()].map((entry) => entry.exerciseId),
  );

  let warmupEntries: SessionEntry[];
  let cooldownEntries: SessionEntry[];
  if (isQuick) {
    const warmupEx = selectWarmupCooldown({
      role: 'warmup',
      pool,
      focus,
      userState,
      today: clock.today,
      rng,
      excludeIds: mainExerciseIds,
    });
    const cooldownEx = selectWarmupCooldown({
      role: 'cooldown',
      pool,
      focus,
      userState,
      today: clock.today,
      rng,
      excludeIds: warmupEx ? new Set([...mainExerciseIds, warmupEx.id]) : mainExerciseIds,
    });
    warmupEntries = warmupEx ? [prescribeWarmupCooldown(warmupEx, 'warmup')] : [];
    cooldownEntries = cooldownEx ? [prescribeWarmupCooldown(cooldownEx, 'cooldown')] : [];
  } else {
    const warmupTargetSec = warmupMinutes(targetMinutes) * 60;
    const cooldownTargetSec = cooldownMinutes(targetMinutes) * 60;
    const warmupExs = selectWarmupCooldownGroup({
      role: 'warmup',
      pool,
      focus,
      userState,
      today: clock.today,
      rng,
      targetSec: warmupTargetSec,
      excludeIds: mainExerciseIds,
    });
    const cooldownExs = selectWarmupCooldownGroup({
      role: 'cooldown',
      pool,
      focus,
      userState,
      today: clock.today,
      rng,
      targetSec: cooldownTargetSec,
      excludeIds: new Set([...mainExerciseIds, ...warmupExs.map((e) => e.id)]),
    });
    warmupEntries = warmupExs.map((e) => prescribeWarmupCooldown(e, 'warmup'));
    cooldownEntries = cooldownExs.map((e) => prescribeWarmupCooldown(e, 'cooldown'));
  }
  const warmupSec = warmupEntries.reduce((a, e) => a + e.estimatedSec, 0);
  const cooldownSec = cooldownEntries.reduce((a, e) => a + e.estimatedSec, 0);

  // §5.1 step 6 — time fit, over the slots in template priority order. With the expanded
  // optional-slot supply above, this can now actually fill a long budget instead of stopping
  // once the old static slot list ran out.
  const slotEntries: SlotEntry[] = [];
  for (const slot of template.slots) {
    const entry = entriesBySlotId.get(slot.id);
    if (entry) slotEntries.push({ required: slot.required, entry });
  }
  const fit = fitMainEntries(slotEntries, targetMinutes, warmupSec, cooldownSec);

  // `withinTenPercent` is §5.6's actual requirement, not a decoration — read it. If the session
  // still falls outside ±10% after the corrective sets-trim above and every optional slot the
  // (now-expanded) template could supply, report it explicitly, the same way a PATTERN GAP is
  // never silent (§5.2), rather than quietly returning an off-target plan. Direction and reason
  // are named separately and deliberately: an overrun is not a shortfall, and a field that blurs
  // the two would read as a content limitation when it's the opposite, more costly failure mode
  // (§1.1).
  //
  // Carried-forward issue #7: an earlier version called every 'under' case 'thin_pool', which was
  // wrong whenever the true cause was the template or the fit loop rather than the library — a
  // wrong reason sends the next person to top up content that was never short. Distinguish:
  //   - 'thin_pool': either (a) an optional accessory slot the template offered had ZERO eligible
  //     candidates, or (b) a REQUIRED slot came back as a PATTERN GAP ('stated_imbalance' — no
  //     band exception rescued it) — in both cases selection genuinely had nothing to put
  //     somewhere, which is exactly what "the library/level is short" means, whether it's an
  //     optional accessory or a required pattern that came up empty.
  //   - 'template_exhausted': every slot the template offered — required and optional alike — DID
  //     get filled, so the pool wasn't the limiter — the template's §5.6 exercise-count-sanity
  //     ceiling simply stopped offering more slots before the time budget was used up.
  const optionalAccessorySlotIds = new Set(
    accessorySlots.filter((s) => !s.required).map((s) => s.id),
  );
  const filledOptionalSlotIds = new Set(mainSelection.picks.map((p) => p.slotId));
  const anyOptionalSlotHadNoEligibleCandidate = [...optionalAccessorySlotIds].some(
    (id) => !filledOptionalSlotIds.has(id),
  );
  const anyRequiredSlotWasAGap = patternGaps.some((g) => g.resolution === 'stated_imbalance');
  const trueContentShortfall = anyOptionalSlotHadNoEligibleCandidate || anyRequiredSlotWasAGap;
  const timeBudgetDeviation: TimeBudgetDeviation | undefined = fit.withinTenPercent
    ? undefined
    : fit.estimatedMinutes < targetMinutes
      ? {
          targetMinutes,
          estimatedMinutes: fit.estimatedMinutes,
          direction: 'under',
          reason: trueContentShortfall ? 'thin_pool' : 'template_exhausted',
        }
      : {
          targetMinutes,
          estimatedMinutes: fit.estimatedMinutes,
          direction: 'over',
          reason: 'structural_minimum',
        };

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

  // §5.8's own example names exactly one novel exercise ("New today: Copenhagen plank") —
  // novelty is meant to flag the one new thing in an otherwise-familiar session, not to
  // enumerate every exercise when the whole session is new (a brand-new user's first few
  // sessions, where the calibration notice already covers "this is all new"). Cap the callout
  // and suppress it entirely when nearly everything is novel.
  const NOVELTY_DISPLAY_CAP = 2;
  const mostlyNovel = fit.main.length > 0 && noveltyNames.size >= fit.main.length * 0.75;
  const displayNoveltyNames = mostlyNovel ? [] : [...noveltyNames].slice(0, NOVELTY_DISPLAY_CAP);

  const minimumTargetClamp =
    !isQuick && requestedTargetMinutes < MINIMUM_SUPPORTED_TARGET_MINUTES
      ? { requestedMinutes: requestedTargetMinutes, effectiveMinutes: targetMinutes }
      : undefined;

  const explanation = composeExplanation({
    recoveryMuscleLabel,
    levelUps,
    masteryPrChecks: [], // surfaced by Wave 3 at session completion, not generation (§6.7)
    noveltyExerciseNames: displayNoveltyNames,
    substitutions,
    patternGaps: patternGapFacts,
    timeBudgetDeviation,
    minimumTargetClamp,
    comebackNotice: comeback.notice ?? undefined,
    calibrationFirstSessionNotice: !userState.hasEverCompletedSession,
    balancedAgainst: fit.main[0]?.pattern,
  });

  return {
    focus,
    difficulty,
    format: 'straight_sets',
    targetMinutes,
    estimatedMinutes: fit.estimatedMinutes,
    warmup: warmupEntries,
    main: fit.main,
    cooldown: cooldownEntries,
    explanation,
    patternGaps,
    timeBudgetDeviation,
    anchorsSnapshot: userState.profile.anchorsAvailable,
    engineVersion: ENGINE_VERSION,
    generatedAtLocalDate: clock.today,
  };
}

/** §9.5 — same pipeline, minimal template + fixed ~7min budget + `medium` difficulty. */
export function generateQuickSession(
  input: Omit<GenerateSessionInput, 'request'> & { focus: Focus },
): SessionPlan {
  return generateSession({
    ...input,
    request: { focus: input.focus, difficulty: 'medium', targetMinutes: 7, quickSession: true },
  });
}

// Re-export the exercise type for callers that only import from the pipeline module.
export type { Exercise };
