/**
 * §4.2 / §6.1 ladder lookups. `level_id` is a stable identifier, never a positional index
 * (invariant 5) — every lookup here is by id, and index is only ever a local loop variable,
 * never persisted or compared across content versions.
 */
import type { Exercise, ProgressionFamily, ProgressionFamilyLevel } from '@roamfit/data';
import { CALIBRATION_START_PERCENTILE } from './constants';

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

export function exerciseForLevel(
  family: ProgressionFamily,
  levelId: string,
  library: readonly Exercise[],
): Exercise | undefined {
  const level = levelById(family, levelId);
  if (!level) return undefined;
  return library.find((e) => e.id === level.exercise_id);
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

/** §6.5 cold start — every family starts at roughly the 30th percentile of its ladder. */
export function calibrationStartLevel(family: ProgressionFamily): ProgressionFamilyLevel {
  const idx = Math.round((family.levels.length - 1) * CALIBRATION_START_PERCENTILE);
  return family.levels[Math.min(Math.max(idx, 0), family.levels.length - 1)];
}
