/**
 * Zod schemas for `output_config.format` structured outputs (§7.3). These are the
 * "schema-valid by construction" half of validation; `@roamfit/engine`'s validators are the
 * "validate anyway" half that runs on top, because a schema-valid response can still be
 * semantically wrong (an exercise id that isn't actually in this session, a limitation tag that
 * happens to spell a real enum value but was never actually implied by the text, etc).
 *
 * Kept in sync by hand with `packages/engine/src/llm/validate.ts`'s `Contraindication` list —
 * duplicated rather than imported because `@roamfit/data`'s own list is a private const in its
 * `validate.ts` (not exported), matching the existing pattern of each package holding its own
 * copy of this fixed, rarely-changing vocabulary.
 */
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
// The SDK's `zodOutputFormat` helper is built against zod's v4 core surface
// (`import * as z from 'zod/v4'`). This project's installed zod is 3.25.76, which ships that v4
// surface as a compat subpath — importing plain `zod` here would give the v3 classic API and a
// generic-identity mismatch against the helper's declared type (two structurally-similar but
// nominally distinct `ZodType`s). Importing `zod/v4` is what keeps `zodOutputFormat` type-checking.
import { z } from 'zod/v4';

const FOCUS = z.enum(['upper', 'abs', 'legs', 'full']);
const DIFFICULTY = z.enum(['easy', 'medium', 'hard']);
const EQUIPMENT_PREFERENCE = z.enum(['any', 'band', 'bodyweight']);
const CONTRAINDICATION = z.enum([
  'shoulder_overhead',
  'shoulder_horizontal',
  'elbow',
  'wrist_extension',
  'knee_flexion_loaded',
  'knee_impact',
  'hip',
  'lower_back_flexion',
  'lower_back_extension',
  'neck',
  'ankle',
  'core_pressure',
]);

/** ADR-0002 floor / a generous ceiling — see `packages/engine/src/llm/validate.ts` for why. */
export const IntakeOutputSchema = z
  .object({
    focus: FOCUS,
    difficulty: DIFFICULTY,
    targetMinutes: z.number().min(15).max(90),
    equipmentPreference: EQUIPMENT_PREFERENCE.optional(),
    suggestedLimitationTag: CONTRAINDICATION.optional(),
  })
  .strict();
export type IntakeOutput = z.infer<typeof IntakeOutputSchema>;
export const IntakeOutputFormat = zodOutputFormat(IntakeOutputSchema);

export const CoachVoiceOutputSchema = z
  .object({
    rewrittenExplanation: z.string().min(1).max(600),
    expandedCueExerciseId: z.string().optional(),
    expandedCueText: z.string().optional(),
  })
  .strict();
export type CoachVoiceOutput = z.infer<typeof CoachVoiceOutputSchema>;
export const CoachVoiceOutputFormat = zodOutputFormat(CoachVoiceOutputSchema);

export const DistillationOutputSchema = z
  .object({
    suspectedLimitationTag: CONTRAINDICATION.optional(),
    bandTooLightExerciseIds: z.array(z.string()).optional(),
    aversionExerciseIds: z.array(z.string()).optional(),
  })
  .strict();
export type DistillationOutput = z.infer<typeof DistillationOutputSchema>;
export const DistillationOutputFormat = zodOutputFormat(DistillationOutputSchema);
