/**
 * Track 37g — turn a self-reported placement (an experience level plus optional "how many can you
 * do?" answers, `PLACEMENT_QUESTIONS` in packages/data) into a starting rung for every ladder.
 * Pure; the store applies the result. See packages/data/src/placement.ts for the reasoning.
 */
import { EXPERIENCE_OPTIONS, PLACEMENT_QUESTIONS } from '@roamfit/data';
import type { ExperienceLevel, ProgressionFamily, ProgressionFamilyId } from '@roamfit/data';

export interface PlacementInput {
  experience: ExperienceLevel;
  /** questionId → answerId. Missing or unknown answers fall back to the experience level. */
  answers?: Readonly<Record<string, string>>;
}

/** The rung each family starts on. Every value is a `level_id` the family actually has. */
export function placeOnLadders(
  families: readonly ProgressionFamily[],
  input: PlacementInput,
): Record<ProgressionFamilyId, string> {
  const share = EXPERIENCE_OPTIONS.find((o) => o.id === input.experience)?.ladderShare ?? 0;
  const out = {} as Record<ProgressionFamilyId, string>;
  for (const family of families) {
    const index = Math.min(family.levels.length - 1, Math.floor(share * family.levels.length));
    out[family.id] = family.levels[index].level_id;
  }
  for (const question of PLACEMENT_QUESTIONS) {
    const answerId = input.answers?.[question.id];
    const answer = question.answers.find((a) => a.id === answerId);
    const family = families.find((f) => f.id === question.familyId);
    if (!answer?.levelId || !family) continue;
    if (family.levels.some((l) => l.level_id === answer.levelId)) {
      out[question.familyId] = answer.levelId;
    }
  }
  return out;
}
