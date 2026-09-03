/**
 * §7.1 natural-language intake. Online-only, on-demand, never blocking — the caller (app, via
 * `packages/store`) must always be able to fall back to the pickers when this returns `null` or
 * throws. The model never returns an exercise id, set count, rep target, or band: those fields
 * are structurally absent from `IntakeOutputSchema`, so invariant 2 is enforced by the schema
 * shape before validation even runs.
 */
import type { Contraindication, Difficulty, Focus } from '@roamfit/data';
import {
  validateIntakeOutput,
  type EquipmentPreference,
  type GenerationRequest,
} from '@roamfit/engine';
import type { ParseFn } from '../client';
import { INTAKE_MODEL } from '../models';
import { buildStableSystemBlock, delimitUntrustedText } from '../prompt';
import { IntakeOutputFormat } from '../schemas';

const INTAKE_SYSTEM_PROMPT = `You translate a user's freeform description of what they want out of
a workout today into structured parameters. You do not choose exercises, sets, reps, or bands —
that is decided entirely by a separate deterministic engine after you respond. Return only:
focus (upper/abs/legs/full), difficulty (easy/medium/hard), targetMinutes (15-90), and optionally
equipmentPreference (any/band/bodyweight) and a suggestedLimitationTag if the text clearly implies
a physical limitation (e.g. "shoulder's cranky" -> shoulder_overhead). If the text is ambiguous,
make a reasonable default choice rather than refusing.`;

export interface IntakeJobInput {
  /** The user's typed sentence, e.g. "shoulder's cranky, 20 minutes, hotel room." Untrusted. */
  freeformText: string;
}

export interface IntakeJobResult {
  /** `null` means: could not produce a valid structured result — caller shows the pickers. */
  params: GenerationRequest | null;
  suggestedLimitationTag: Contraindication | null;
  repaired: boolean;
  cacheReadInputTokens: number;
}

export async function runIntakeJob(
  parse: ParseFn,
  input: IntakeJobInput,
): Promise<IntakeJobResult> {
  const system = buildStableSystemBlock(INTAKE_SYSTEM_PROMPT);
  const userBlock = delimitUntrustedText('user intake request', input.freeformText);

  const attempt = async (extra?: string) =>
    parse({
      model: INTAKE_MODEL,
      maxTokens: 512,
      system,
      messages: [{ role: 'user', content: extra ? `${extra}\n\n${userBlock}` : userBlock }],
      outputFormat: IntakeOutputFormat,
    });

  let response = await attempt();
  let repaired = false;
  let validation = response.parsedOutput
    ? validateIntakeOutput(response.parsedOutput)
    : { valid: false, errors: ['schema parse failed'] };

  if (!validation.valid) {
    repaired = true;
    response = await attempt(
      `Your previous response was invalid: ${validation.errors.join('; ')}. Return corrected structured output only, still following the schema.`,
    );
    validation = response.parsedOutput
      ? validateIntakeOutput(response.parsedOutput)
      : { valid: false, errors: ['schema parse failed on repair'] };
  }

  if (!validation.valid || !response.parsedOutput) {
    return {
      params: null,
      suggestedLimitationTag: null,
      repaired,
      cacheReadInputTokens: response.cacheReadInputTokens,
    };
  }

  const parsed = response.parsedOutput;
  return {
    params: {
      focus: parsed.focus as Focus,
      difficulty: parsed.difficulty as Difficulty,
      targetMinutes: parsed.targetMinutes,
      equipmentPreference: parsed.equipmentPreference as EquipmentPreference | undefined,
    },
    suggestedLimitationTag: (parsed.suggestedLimitationTag as Contraindication | undefined) ?? null,
    repaired,
    cacheReadInputTokens: response.cacheReadInputTokens,
  };
}
