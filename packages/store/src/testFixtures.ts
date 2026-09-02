/** Shared fixtures for store integration tests — not itself a test file (no `describe`/`it`). */
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { createRng } from '@roamfit/engine';
import type { EngineClock } from '@roamfit/engine';
import { addDays } from './dates';

export const library = exerciseLibrary;
export const families = familyLibrary;
export { addDays };

/**
 * The shipped ladders with every level trimmed to its anchor (ADR 0010). Since a level holds a
 * set of exercises and `resolveLadderSlot` draws among them, two runs at the same seed no longer
 * program the same exercises — which is the point of the feature, but it breaks any test whose
 * subject is "run the same session twice and compare" (best-set PRs, level-up transitions).
 *
 * Use this where the test is about session-to-session *state*, not about exercise variety. Tests
 * that are about variety should use `families` and assert on the real ladders.
 */
export const singleExerciseFamilies: typeof familyLibrary = {
  ...familyLibrary,
  families: familyLibrary.families.map((f) => ({
    ...f,
    levels: f.levels.map((l) => ({ ...l, exercise_ids: [l.anchor_exercise_id] })),
  })),
};

export function clockFor(today: string, tzId = 'America/New_York'): EngineClock {
  return { today, tzId };
}

export function rngFor(seed: number) {
  return createRng(seed);
}

export function utcInstantFor(localDate: string, hour = 8, minute = 0): string {
  return `${localDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
}
