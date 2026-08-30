/**
 * @roamfit/data — exercise library, progression families, schemas, and validators.
 *
 * The bundled content itself lives in packages/data/library/*.json (196+ exercise records,
 * the 8 v1 progression ladders — wave-01b-content.md, spec.md §4.1, §4.2, §6.6). This module
 * re-exports the shared types and the raw library data for consumers (the engine, tests).
 */
import exercisesJson from '../library/exercises.json';
import familiesJson from '../library/families.json';
import type { ExerciseLibrary, FamilyLibrary } from './schema';

export * from './schema';

export const exerciseLibrary = exercisesJson as unknown as ExerciseLibrary;
export const familyLibrary = familiesJson as unknown as FamilyLibrary;
