/**
 * §4.2 / §6.1 ladder lookups. `level_id` is a stable identifier, never a positional index
 * (invariant 5) — every lookup here is by id, and index is only ever a local loop variable,
 * never persisted or compared across content versions.
 */
import type { Exercise, ProgressionFamily, ProgressionFamilyLevel } from '@roamfit/data';

export function findFamily(
  families: readonly ProgressionFamily[],
  familyId: string,
): ProgressionFamily | undefined {
  return families.find((f) => f.id === familyId);
}

function indexOfLevel(family: ProgressionFamily, levelId: string): number {
  return family.levels.findIndex((l) => l.level_id === levelId);
}

export function levelById(
  family: ProgressionFamily,
  levelId: string,
): ProgressionFamilyLevel | undefined {
  return family.levels.find((l) => l.level_id === levelId);
}

/**
 * The level's **anchor** exercise (ADR 0010) — the one whose `metric`/`equipment`/`band` drive
 * every micro-progression calculation, and the one to name when displaying the level. This is
 * deliberately NOT "the exercise that was programmed": a level can hold several siblings, and
 * basing the progression math on whichever one the RNG picked would make advancing depend on the
 * draw. Use `exercisesForLevel` when you want the full programmable set.
 */
export function exerciseForLevel(
  family: ProgressionFamily,
  levelId: string,
  library: readonly Exercise[],
): Exercise | undefined {
  const level = levelById(family, levelId);
  if (!level) return undefined;
  return library.find((e) => e.id === level.anchor_exercise_id);
}

/** Every exercise programmable at this level (ADR 0010), anchor included. Missing ids are
 *  skipped rather than throwing — `validate.ts` is what guarantees they resolve. */
export function exercisesForLevel(
  family: ProgressionFamily,
  levelId: string,
  library: readonly Exercise[],
): Exercise[] {
  const level = levelById(family, levelId);
  if (!level) return [];
  const byId = new Map(library.map((e) => [e.id, e]));
  return level.exercise_ids.flatMap((id) => {
    const ex = byId.get(id);
    return ex ? [ex] : [];
  });
}

/** Every exercise programmable at any level strictly below `levelId` (ADR 0010 shape),
 *  flattened across levels. Used to widen a laddered slot's eligible pool to rungs the user has
 *  already achieved, so mastering a level doesn't retire its exercises outright. */
export function exercisesBelowLevel(
  family: ProgressionFamily,
  levelId: string,
  library: readonly Exercise[],
): Exercise[] {
  const idx = indexOfLevel(family, levelId);
  if (idx <= 0) return [];
  return family.levels
    .slice(0, idx)
    .flatMap((level) => exercisesForLevel(family, level.level_id, library));
}

export function isMaxLevel(family: ProgressionFamily, levelId: string): boolean {
  const idx = indexOfLevel(family, levelId);
  return idx >= 0 && idx === family.levels.length - 1;
}

export function isMinLevel(family: ProgressionFamily, levelId: string): boolean {
  return indexOfLevel(family, levelId) === 0;
}

export function nextLevel(
  family: ProgressionFamily,
  levelId: string,
): ProgressionFamilyLevel | undefined {
  const idx = indexOfLevel(family, levelId);
  if (idx < 0 || idx >= family.levels.length - 1) return undefined;
  return family.levels[idx + 1];
}

export function prevLevel(
  family: ProgressionFamily,
  levelId: string,
): ProgressionFamilyLevel | undefined {
  const idx = indexOfLevel(family, levelId);
  if (idx <= 0) return undefined;
  return family.levels[idx - 1];
}

/** 1-based "Level N of M" for display (§6.4) — a UI concern, but cheap to compute here since we
 *  already have the index. Never used as a storage key. */
export function levelOrdinal(
  family: ProgressionFamily,
  levelId: string,
): { n: number; of: number } {
  const idx = indexOfLevel(family, levelId);
  return { n: idx + 1, of: family.levels.length };
}

/**
 * Cold start — every family starts at **level 1** (ADR 0012).
 *
 * §6.5 put this at roughly the 30th percentile of the ladder, which meant a new user was handed a
 * mid-ladder exercise they had never done and told it was their level. Starting at the bottom
 * makes the ladder mean what it says: you climb it. The escape hatch for a user who is already
 * past the lower rungs is `levelUpForTooEasy` — an explicit, repeatable "this is too easy" —
 * plus the §6.5 automatic overshoot detection, not a guess baked into the seed.
 */
export function calibrationStartLevel(family: ProgressionFamily): ProgressionFamilyLevel {
  return family.levels[0];
}
