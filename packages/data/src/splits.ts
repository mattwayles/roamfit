/**
 * Track 37j — the Push and Pull splits. They are sessions, not library tags: a push day draws on
 * the exercises tagged `upper` whose movement pushes, a pull day on those that pull, so no exercise
 * record needs re-tagging and a new upper exercise joins the right split by its pattern alone.
 *
 * Shoulder isolation is the one pattern that serves both: raises to the front and side work the
 * pushing muscles, rear-delt and upper-back work the pulling ones, so that pattern is split by the
 * exercise's primary muscle.
 */
import type { Exercise, Focus, LibraryFocus, Pattern } from './schema';

export type SplitFocus = 'push' | 'pull';

export const SPLIT_PATTERNS: Readonly<Record<SplitFocus, readonly Pattern[]>> = {
  push: ['horizontal_push', 'vertical_push', 'elbow_extension', 'shoulder_isolation'],
  pull: ['horizontal_pull', 'vertical_pull', 'elbow_flexion', 'shoulder_isolation'],
};

/** Which primary muscles make a shoulder-isolation exercise belong to each split. */
export const SPLIT_SHOULDER_MUSCLES: Readonly<Record<SplitFocus, readonly string[]>> = {
  push: ['front_delts', 'side_delts'],
  pull: ['rear_delts', 'traps', 'upper_back'],
};

export function isSplitFocus(focus: Focus): focus is SplitFocus {
  return focus === 'push' || focus === 'pull';
}

/** The library tag a session focus reads exercises by (Push and Pull read `upper`). */
export function libraryFocus(focus: Focus): LibraryFocus {
  return isSplitFocus(focus) ? 'upper' : focus;
}

/** Whether a main-work exercise belongs in a session of `focus` by tag and, for a split, pattern. */
export function suitsFocus(exercise: Exercise, focus: Focus): boolean {
  if (!exercise.focus.includes(libraryFocus(focus))) return false;
  if (!isSplitFocus(focus)) return true;
  if (!SPLIT_PATTERNS[focus].includes(exercise.pattern)) return false;
  return (
    exercise.pattern !== 'shoulder_isolation' ||
    exercise.primary.some((m) => SPLIT_SHOULDER_MUSCLES[focus].includes(m))
  );
}
