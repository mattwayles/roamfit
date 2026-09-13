/**
 * @roamfit/data — exercise library, progression families, schemas, and validators.
 *
 * The bundled content itself lives in packages/data/library/*.json (196+ exercise records,
 * the 8 v1 progression ladders — wave-01b-content.md, spec.md §4.1, §4.2, §6.6). This module
 * re-exports the shared types and the raw library data for consumers (the engine, tests).
 */
import exercisesJson from '../library/exercises.json';
import familiesJson from '../library/families.json';
import type { Exercise, ExerciseLibrary, FamilyLibrary } from './schema';

export * from './schema';

export const exerciseLibrary = exercisesJson as unknown as ExerciseLibrary;
export const familyLibrary = familiesJson as unknown as FamilyLibrary;

/** Track 14 — classification is a pattern, not a muscle: an exercise is "cardio" iff its
 *  `pattern` is `conditioning`. This is what lets `mainSelection`'s same-pattern swap and a
 *  strength template's pattern slots exclude cardio moves structurally, with zero extra code —
 *  a strength template never asks for `conditioning`, so the exclusion falls out on its own. */
export function isCardioExercise(e: Exercise): boolean {
  return e.pattern === 'conditioning';
}

// There is deliberately no bundled figure/demo-image registry — see ADR 0008. Offline demo
// guidance is the `setup` cue text on each exercise record, rendered as the "How to" block.
