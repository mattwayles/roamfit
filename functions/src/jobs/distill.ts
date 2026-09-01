/**
 * §7.1 feedback distillation — retrospective text -> structured signals (suspected limitation,
 * band too light, exercise aversion). Once at completion, queued (§11.3). On any failure the
 * fallback is simply "no signals" — the retrospective text itself is already stored verbatim by
 * `packages/store` regardless of this job, so nothing is lost, only the structured-signal
 * enrichment is skipped.
 */
import type { Contraindication } from '@roamfit/data';
import { validateDistillationOutput } from '@roamfit/engine';
import type { ParseFn } from '../client';
import { DISTILLATION_MODEL } from '../models';
import { buildStableSystemBlock, delimitUntrustedText } from '../prompt';
import { DistillationOutputFormat } from '../schemas';

const DISTILL_SYSTEM_PROMPT = `You read a user's freeform retrospective about a workout they just
completed and extract structured signals, ONLY when clearly implied by the text — never guess.
You may name at most one suspectedLimitationTag from the fixed vocabulary you were given. You may
list exercise ids (from the session's own exercise list, given to you) that the text says felt too
easy on the band, or that the user disliked. Leave every field absent if nothing is clearly
implied. This never directly changes anything — it only surfaces a suggestion for a human or a
later confirmed step.`;

export interface DistillJobInput {
  retrospectiveText: string;
  sessionExerciseIds: readonly string[];
}

export interface DistillJobResult {
  suspectedLimitationTag: Contraindication | null;
  bandTooLightExerciseIds: string[];
  aversionExerciseIds: string[];
  usedFallback: boolean;
  repaired: boolean;
  cacheReadInputTokens: number;
}

const EMPTY_RESULT: Omit<DistillJobResult, 'usedFallback' | 'repaired' | 'cacheReadInputTokens'> = {
  suspectedLimitationTag: null,
  bandTooLightExerciseIds: [],
  aversionExerciseIds: [],
};

export async function runDistillJob(
  parse: ParseFn,
  input: DistillJobInput,
): Promise<DistillJobResult> {
  if (input.retrospectiveText.trim() === '') {
    return { ...EMPTY_RESULT, usedFallback: false, repaired: false, cacheReadInputTokens: 0 };
  }

  const system = buildStableSystemBlock(
    `${DISTILL_SYSTEM_PROMPT}\n\nThis session's exercise ids: ${JSON.stringify(input.sessionExerciseIds)}`,
  );
  const userBlock = delimitUntrustedText('user retrospective', input.retrospectiveText);

  const attempt = async (extra?: string) =>
    parse({
      model: DISTILLATION_MODEL,
      maxTokens: 512,
      system,
      messages: [{ role: 'user', content: extra ? `${extra}\n\n${userBlock}` : userBlock }],
      outputFormat: DistillationOutputFormat,
    });

  let response = await attempt();
  let repaired = false;
  let validation = response.parsedOutput
    ? validateDistillationOutput(response.parsedOutput, input.sessionExerciseIds)
    : { valid: false, errors: ['schema parse failed'] };

  if (!validation.valid) {
    repaired = true;
    response = await attempt(
      `Your previous response was invalid: ${validation.errors.join('; ')}. Return corrected structured output only.`,
    );
    validation = response.parsedOutput
      ? validateDistillationOutput(response.parsedOutput, input.sessionExerciseIds)
      : { valid: false, errors: ['schema parse failed on repair'] };
  }

  if (!validation.valid || !response.parsedOutput) {
    return {
      ...EMPTY_RESULT,
      usedFallback: true,
      repaired,
      cacheReadInputTokens: response.cacheReadInputTokens,
    };
  }

  const parsed = response.parsedOutput;
  return {
    suspectedLimitationTag: (parsed.suspectedLimitationTag as Contraindication | undefined) ?? null,
    bandTooLightExerciseIds: parsed.bandTooLightExerciseIds ?? [],
    aversionExerciseIds: parsed.aversionExerciseIds ?? [],
    usedFallback: false,
    repaired,
    cacheReadInputTokens: response.cacheReadInputTokens,
  };
}
