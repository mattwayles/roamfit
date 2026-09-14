/**
 * §9.7/§6.4/§6.7/§10.9 completion celebration — pure composition from `completeSession`'s own
 * return value plus the milestone rows it wrote, into what the Summary screen renders. No
 * decisions here beyond "which milestones are headline highlights vs. a quiet accumulating list"
 * — every fact (who leveled up, what the new exercise is, whether a PR happened at Mastery) comes
 * straight from the engine/store, never invented here.
 *
 * Highlights used to be separate full-screen interrupts stepped through one at a time before the
 * completion screen. They now land *on* the completion screen, as its crescendo — one screen, one
 * moment, instead of a queue of Continue taps between the user and their win.
 */
import {
  exerciseForLevel,
  findFamily,
  isMaxLevel,
  levelOrdinal,
  seedFromString,
} from '@roamfit/engine';
import type { ProgressionEvent } from '@roamfit/engine';
import type { ExerciseLibrary, FamilyLibrary } from '@roamfit/data';
import type { milestonesRepo } from '@roamfit/store';

export interface LevelUpCelebration {
  kind: 'level_up';
  familyName: string;
  newExerciseName: string;
  /** The rung just climbed off, for the "from → to" line. Null only if the ladder data can't name
   *  one (a level_up onto the bottom rung shouldn't happen, but this never guesses). */
  fromExerciseName: string | null;
  /** 1-based "Level N of M" of the new rung — display only (invariant 5: never a storage key). */
  levelN: number;
  levelOf: number;
}

export interface MasteryCelebration {
  kind: 'mastery_pr';
  familyName: string;
  exerciseName: string;
  value: number | null;
}

export type HighlightCelebration = LevelUpCelebration | MasteryCelebration;

export interface QuietMilestone {
  type: milestonesRepo.MilestoneType;
  text: string;
}

export interface CelebrationViewModel {
  /** §6.4/§6.7 — level-ups and Mastery best sets: the unmissable part of the completion screen,
   *  each revealed on its own beat. */
  highlights: HighlightCelebration[];
  /** §9.7 — every other milestone this session earned. Still positive, still accumulating,
   *  just not a headline. */
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
  const highlights: HighlightCelebration[] = [];
  const masteryExerciseIds = new Set<string>();

  for (const { familyId, event } of progressionEvents) {
    const family = findFamily(families.families, familyId);
    if (!family) continue;

    if (event.kind === 'level_up') {
      const exercise = exerciseForLevel(family, event.levelId, library.exercises);
      const { n, of } = levelOrdinal(family, event.levelId);
      const fromLevel = n >= 2 ? family.levels[n - 2] : undefined;
      const fromExercise = fromLevel
        ? exerciseForLevel(family, fromLevel.level_id, library.exercises)
        : undefined;
      highlights.push({
        kind: 'level_up',
        familyName: family.name,
        newExerciseName: exercise?.name ?? event.levelId,
        fromExerciseName: fromExercise?.name ?? null,
        levelN: n,
        levelOf: of,
      });
    } else if (event.kind === 'mastery_pr_check') {
      // The exercises at this family's (already-max) current level are the ones being re-attempted
      // for a best-set PR — record them so a matching best_set_pr milestone below is recognized as
      // the §6.7 Mastery treatment rather than an ordinary PR. Any sibling at the max level counts
      // (ADR 0010): the PR is against whichever one was actually programmed.
      for (const level of family.levels) {
        if (!isMaxLevel(family, level.level_id)) continue;
        for (const exId of level.exercise_ids) masteryExerciseIds.add(exId);
      }
    }
  }

  const quiet: QuietMilestone[] = [];
  for (const m of milestones) {
    if (m.type === 'level_up') continue; // already represented above, as a highlight
    if (m.type === 'best_set_pr') {
      const exerciseId = m.payload.exerciseId as string | undefined;
      const exercise = exerciseId ? library.exercises.find((e) => e.id === exerciseId) : undefined;
      const name = exercise?.name ?? exerciseId ?? 'an exercise';
      const value = typeof m.payload.value === 'number' ? m.payload.value : null;
      if (exerciseId && masteryExerciseIds.has(exerciseId)) {
        highlights.push({
          kind: 'mastery_pr',
          familyName:
            families.families.find((f) =>
              f.levels.some(
                (l) => l.exercise_ids.includes(exerciseId) && isMaxLevel(f, l.level_id),
              ),
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

  return { highlights, quiet };
}

/** The completion screen's big slammed-in headline. Every line is pure hype about what the user
 *  just did — invariant 4 in reverse, nothing here ever compares against a plan or a past self. */
export const HYPE_HEADLINES: readonly string[] = [
  'YOU CRUSHED IT!',
  'ABSOLUTE BEAST MODE!',
  'THAT WAS HUGE!',
  'WORKOUT DESTROYED!',
  'NAILED IT. LEGEND.',
  'BUILT DIFFERENT!',
  'UNSTOPPABLE!',
  'WHAT A SESSION!',
];

/** Stable per session (seeded from its id), so re-rendering never swaps the headline mid-animation
 *  and a test can predict it. */
export function pickHypeHeadline(seed: string): string {
  return HYPE_HEADLINES[seedFromString(seed) % HYPE_HEADLINES.length];
}
