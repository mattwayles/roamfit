/**
 * §7.1 coach voice — rewrites the §5.8 explanation line and may expand the setup cue for one
 * exercise on its first-ever performance. Async, cached per session, never blocking: the
 * deterministic explanation the engine already composed (`composeExplanation`) is always shown
 * first and is the fallback on any failure — a coach line an hour late is fine (§11.3), a
 * deterministic-forever line is also fine, a blocked approval screen is not.
 */
import { validateCoachVoiceOutput } from '@roamfit/engine';
import type { ParseFn } from '../client';
import { COACH_VOICE_MODEL } from '../models';
import { buildStableSystemBlock, delimitUntrustedText } from '../prompt';
import { CoachVoiceOutputFormat } from '../schemas';

const COACH_VOICE_SYSTEM_PROMPT = `You rewrite a workout-session explanation line in a warm,
concrete coach voice, preserving every fact in the original sentence (what changed and why) —
never invent a fact, never drop one, never change a number. Optionally, if a "first-ever
performance" exercise is named, you may also write one or two encouraging sentences expanding its
setup cue for a first-timer, referencing that exact exercise id only.`;

export interface CoachVoiceJobInput {
  deterministicExplanation: string;
  sessionExerciseIds: readonly string[];
  /** Only present if this session includes a first-ever-performance exercise eligible for cue
   *  expansion. */
  firstEverExerciseId?: string;
  firstEverExerciseSetupCue?: string;
}

export interface CoachVoiceJobResult {
  explanation: string;
  usedFallback: boolean;
  expandedCue: { exerciseId: string; text: string } | null;
  repaired: boolean;
  cacheReadInputTokens: number;
}

export async function runCoachVoiceJob(
  parse: ParseFn,
  input: CoachVoiceJobInput,
): Promise<CoachVoiceJobResult> {
  const system = buildStableSystemBlock(COACH_VOICE_SYSTEM_PROMPT);
  const cueContext = input.firstEverExerciseId
    ? `\n\nFirst-ever performance this session: exerciseId="${input.firstEverExerciseId}", setup cue: "${input.firstEverExerciseSetupCue ?? ''}"`
    : '';
  const userBlock =
    delimitUntrustedText(
      'deterministic explanation line to rewrite',
      input.deterministicExplanation,
    ) + cueContext;

  const attempt = async (extra?: string) =>
    parse({
      model: COACH_VOICE_MODEL,
      maxTokens: 512,
      system,
      messages: [{ role: 'user', content: extra ? `${extra}\n\n${userBlock}` : userBlock }],
      outputFormat: CoachVoiceOutputFormat,
    });

  let response = await attempt();
  let repaired = false;
  let validation = response.parsedOutput
    ? validateCoachVoiceOutput(response.parsedOutput, input.sessionExerciseIds)
    : { valid: false, errors: ['schema parse failed'] };

  if (!validation.valid) {
    repaired = true;
    response = await attempt(
      `Your previous response was invalid: ${validation.errors.join('; ')}. Return corrected structured output only.`,
    );
    validation = response.parsedOutput
      ? validateCoachVoiceOutput(response.parsedOutput, input.sessionExerciseIds)
      : { valid: false, errors: ['schema parse failed on repair'] };
  }

  if (!validation.valid || !response.parsedOutput) {
    return {
      explanation: input.deterministicExplanation,
      usedFallback: true,
      expandedCue: null,
      repaired,
      cacheReadInputTokens: response.cacheReadInputTokens,
    };
  }

  const parsed = response.parsedOutput;
  return {
    explanation: parsed.rewrittenExplanation,
    usedFallback: false,
    expandedCue:
      parsed.expandedCueExerciseId && parsed.expandedCueText
        ? { exerciseId: parsed.expandedCueExerciseId, text: parsed.expandedCueText }
        : null,
    repaired,
    cacheReadInputTokens: response.cacheReadInputTokens,
  };
}
