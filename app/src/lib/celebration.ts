/**
 * §9.7/§6.4/§6.7/§10.9 completion celebration — pure composition from `completeSession`'s own
 * return value plus the milestone rows it wrote, into what the Summary screen renders. No
 * decisions here beyond "which milestones are unmissable-full-screen vs. a quiet accumulating
 * list" — every fact (who leveled up, what the new exercise is, whether a PR happened at Mastery)
 * comes straight from the engine/store, never invented here.
 */
import { exerciseForLevel, findFamily, isMaxLevel } from '@roamfit/engine';
import type { ProgressionEvent } from '@roamfit/engine';
import type { ExerciseLibrary, FamilyLibrary } from '@roamfit/data';
import type { milestonesRepo } from '@roamfit/store';

export interface LevelUpCelebration {
  kind: 'level_up';
  familyName: string;
  newExerciseName: string;
}

export interface MasteryCelebration {
  kind: 'mastery_pr';
  familyName: string;
  exerciseName: string;
  value: number | null;
}

export type FullScreenCelebration = LevelUpCelebration | MasteryCelebration;

export interface QuietMilestone {
  type: milestonesRepo.MilestoneType;
  text: string;
}

export interface CelebrationViewModel {
  /** §6.4/§6.7 — "full-screen, unmissable, before anything else." Shown one at a time. */
  fullScreen: FullScreenCelebration[];
  /** §9.7 — every other milestone this session earned. Still positive, still accumulating,
   *  just not a full-screen interrupt. */
  quiet: QuietMilestone[];
}

/** `progressionEvents`/`milestones` are exactly what `completeSession` returned and what
 *  `milestonesRepo.getMilestonesForSession` reads back — this function never recomputes whether
 *  something happened, only how to present it. */
export function buildCelebrationViewModel(
  library: ExerciseLibrary,
  families: FamilyLibrary,
  progressionEvents: { familyId: string; event: ProgressionEvent }[],
  milestones: milestonesRepo.MilestoneRecord[],
): CelebrationViewModel {
  const fullScreen: FullScreenCelebration[] = [];
  const masteryExerciseIds = new Set<string>();

  for (const { familyId, event } of progressionEvents) {
    const family = findFamily(families.families, familyId);
    if (!family) continue;

    if (event.kind === 'level_up' || event.kind === 'calibration_advance') {
      const exercise = exerciseForLevel(family, event.levelId, library.exercises);
      fullScreen.push({
        kind: 'level_up',
        familyName: family.name,
        newExerciseName: exercise?.name ?? event.levelId,
      });
    } else if (event.kind === 'mastery_pr_check') {
      // The exercise at this family's (already-max) current level is the one being re-attempted
      // for a best-set PR — record it so a matching best_set_pr milestone below is recognized as
      // the §6.7 Mastery treatment rather than an ordinary PR.
      const maxLevelExercise = family.levels
        .map((l) => l.exercise_id)
        .find((exId) => {
          const level = family.levels.find((l) => l.exercise_id === exId);
          return level && isMaxLevel(family, level.level_id);
        });
      if (maxLevelExercise) masteryExerciseIds.add(maxLevelExercise);
    }
  }

  const quiet: QuietMilestone[] = [];
  for (const m of milestones) {
    if (m.type === 'level_up') continue; // already represented above, full-screen
    if (m.type === 'best_set_pr') {
      const exerciseId = m.payload.exerciseId as string | undefined;
      const exercise = exerciseId ? library.exercises.find((e) => e.id === exerciseId) : undefined;
      const name = exercise?.name ?? exerciseId ?? 'an exercise';
      const value = typeof m.payload.value === 'number' ? m.payload.value : null;
      if (exerciseId && masteryExerciseIds.has(exerciseId)) {
        fullScreen.push({
          kind: 'mastery_pr',
          familyName:
            families.families.find((f) =>
              f.levels.some((l) => l.exercise_id === exerciseId && isMaxLevel(f, l.level_id)),
            )?.name ?? name,
          exerciseName: name,
          value,
        });
      } else {
        quiet.push({
          type: m.type,
          text: value !== null ? `New best set — ${name}: ${value}` : `New best set — ${name}`,
        });
      }
      continue;
    }
    if (m.type === 'nth_session') {
      quiet.push({ type: m.type, text: `Session #${m.payload.n as number}` });
    } else if (m.type === 'new_city') {
      quiet.push({ type: m.type, text: `New city: ${(m.payload.city as string) ?? ''}` });
    } else if (m.type === 'recovery_week') {
      quiet.push({ type: m.type, text: 'Recovery week complete' });
    }
  }

  return { fullScreen, quiet };
}
