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
  withOneFewerSet,
} from './prescription/prescribe';
import { fitMainEntries } from './timefit/fitSession';
import type { SlotEntry } from './timefit/fitSession';
import {
  cooldownMinutes,
  MINIMUM_SUPPORTED_TARGET_MINUTES,
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

  // §9.5 Quick Session overrides target/effort; everything downstream is identical.
  const isQuick = Boolean(request.quickSession);
  const focus: Focus = request.focus;
  const effort = isQuick ? 'normal' : request.effort;
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

  // §5.1 step 2 — template. Non-quick sessions get extra optional accessory slots appended (up
  // to §5.6's exercise-count-sanity max for this target) so time fit (step 6) has enough supply
  // to actually FILL a long budget rather than stopping once the static slot list runs out —
  // see STATUS-2-engine.md's time-fit correction. Quick Session stays deliberately minimal.
  const baseTemplate = isQuick
    ? buildQuickSessionTemplate({
        focus,
        targetMinutes,
        effort,
        library: allExercises,
        history: userState.history,
      })
    : buildFocusTemplate({
        focus,
        targetMinutes,
        effort,
        library: allExercises,
        history: userState.history,
      });
  const template = isQuick
    ? baseTemplate
    : expandOptionalSlots(baseTemplate, focus, mainExerciseCountRange(targetMinutes)[1]);

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
        })
      : { picks: [], patternGaps: [] };

  const patternGaps: PatternGapNote[] = [...mainSelection.patternGaps];
  const substitutions: SubstitutionFact[] = [];
  const levelUps: LevelUpFact[] = [];
  const noveltyNames = new Set<string>();

  const mostRecentSessionDate = [...userState.history]
    .reverse()
    .find((s) => s.status !== 'discarded')?.localDate;

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
          requestedEffort: effort,
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
          requestedEffort: effort,
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
    });
    const cooldownEx = selectWarmupCooldown({
      role: 'cooldown',
      pool,
      focus,
      userState,
      today: clock.today,
      rng,
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
    });
    const cooldownExs = selectWarmupCooldownGroup({
      role: 'cooldown',
      pool,
      focus,
      userState,
      today: clock.today,
      rng,
      targetSec: cooldownTargetSec,
    });
    warmupEntries = warmupExs.map((e) => prescribeWarmupCooldown(e, 'warmup'));
    cooldownEntries = cooldownExs.map((e) => prescribeWarmupCooldown(e, 'cooldown'));
  }
  const warmupSec = warmupEntries.reduce((a, e) => a + e.estimatedSec, 0);
  const cooldownSec = cooldownEntries.reduce((a, e) => a + e.estimatedSec, 0);

  // Overrun correction: if the REQUIRED entries alone (before any optional slot is even
  // considered) already exceed the +10% ceiling, trim sets rather than dropping a required
  // pattern slot (§5.6) — at ANY target length, not just short ones (a 25-60min session can
  // overrun just as easily as a 15min one when its required patterns happen to run long).
  // Sized against the *actual* warmup/cooldown time just resolved above, not the clamp-formula
  // estimate — see the comment on `budgetSec` inside `fitMainEntries` for why that matters.
  //
  // Removes exactly one set at a time from whichever required entry is currently largest, rather
  // than a proportional multiplier: a multiplier rounds to the nearest integer sets count, which
  // is too coarse to move anything when the needed correction is under ~15%
  // (`round(3 * 0.9) === 3`) — that coarseness was letting real, mainstream-target overruns
  // through uncorrected. `withOneFewerSet` floors at 1 set per entry; if every required entry is
  // already at 1 set and the total still exceeds the ceiling, that's a genuine, reported overrun
  // (see below) — not silently ignored, but confirmed to be the true floor, not a rounding miss.
  const requiredSlotIds = new Set(template.slots.filter((s) => s.required).map((s) => s.id));
  function requiredMainSecTotal(): number {
    let sum = 0;
    for (const id of requiredSlotIds) sum += entriesBySlotId.get(id)?.estimatedSec ?? 0;
    return sum;
  }
  const mainBudgetSecActual = Math.max(0, targetMinutes * 60 - warmupSec - cooldownSec);
  const ceilingSec = mainBudgetSecActual * 1.1;
  let trimGuard = 200; // bounded: at most a few sets per required entry, never truly unbounded
  while (requiredMainSecTotal() > ceilingSec && trimGuard-- > 0) {
    let largestId: string | undefined;
    let largestSec = -1;
    for (const id of requiredSlotIds) {
      const entry = entriesBySlotId.get(id);
      if (entry && entry.sets > 1 && entry.estimatedSec > largestSec) {
        largestSec = entry.estimatedSec;
        largestId = id;
      }
    }
    if (!largestId) break; // every required entry is already at the sets floor
    entriesBySlotId.set(largestId, withOneFewerSet(entriesBySlotId.get(largestId)!));
  }

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
  // (now-expanded) template could supply, that means the eligible pool genuinely is too thin (an
  // 'under' deviation) or the required slots alone can't be trimmed further even at the sets
  // floor (an 'over' deviation — should be rare to non-existent post-ADR-0002) — report it
  // explicitly, the same way a PATTERN GAP is never silent (§5.2), rather than quietly returning
  // an off-target plan. Direction and reason are named separately and deliberately: an overrun
  // is not a shortfall, and a field that blurs the two would read as a content limitation when
  // it's the opposite, more costly failure mode (§1.1).
  const timeBudgetDeviation: TimeBudgetDeviation | undefined = fit.withinTenPercent
    ? undefined
    : fit.estimatedMinutes < targetMinutes
      ? {
          targetMinutes,
          estimatedMinutes: fit.estimatedMinutes,
          direction: 'under',
          reason: 'thin_pool',
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
    effort,
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
