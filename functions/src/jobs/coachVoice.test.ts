import type { ParseCallArgs, ParseCallResult, ParseFn } from '../client';
import { runCoachVoiceJob } from './coachVoice';

function fakeParse(...results: Array<ParseCallResult<unknown>>): {
  parse: ParseFn;
  calls: ParseCallArgs<unknown>[];
} {
  const calls: ParseCallArgs<unknown>[] = [];
  let i = 0;
  const parse = jest.fn(async (args: ParseCallArgs<unknown>) => {
    calls.push(args);
    const result = results[Math.min(i, results.length - 1)];
    i++;
    return result;
  }) as unknown as ParseFn;
  return { parse, calls };
}

const SESSION_IDS = ['bw-push-up', 'band-row'];

describe('runCoachVoiceJob', () => {
  it('uses the rewritten explanation on a valid response', async () => {
    const { parse } = fakeParse({
      parsedOutput: { rewrittenExplanation: 'Great session — you pushed hard on push-ups today.' },
      cacheReadInputTokens: 900,
    });
    const result = await runCoachVoiceJob(parse, {
      deterministicExplanation: 'Push-ups moved up to Level 5.',
      sessionExerciseIds: SESSION_IDS,
    });
    expect(result.usedFallback).toBe(false);
    expect(result.explanation).toBe('Great session — you pushed hard on push-ups today.');
    expect(result.cacheReadInputTokens).toBe(900);
  });

  it('accepts a cue expansion for an exercise actually in the session', async () => {
    const { parse } = fakeParse({
      parsedOutput: {
        rewrittenExplanation: 'Nice work.',
        expandedCueExerciseId: 'bw-push-up',
        expandedCueText: 'Keep your core tight.',
      },
      cacheReadInputTokens: 0,
    });
    const result = await runCoachVoiceJob(parse, {
      deterministicExplanation: 'Push-ups moved up to Level 5.',
      sessionExerciseIds: SESSION_IDS,
      firstEverExerciseId: 'bw-push-up',
      firstEverExerciseSetupCue: 'Hands under shoulders.',
    });
    expect(result.expandedCue).toEqual({ exerciseId: 'bw-push-up', text: 'Keep your core tight.' });
  });

  // Falls back to the deterministic explanation (never blank, never a partial rewrite) on
  // validation failure — proves the §5.8 line is never worse-than-deterministic even when coach
  // voice fails outright.
  it('falls back to the deterministic explanation when the model names an exercise not in the session', async () => {
    const { parse, calls } = fakeParse(
      {
        parsedOutput: {
          rewrittenExplanation: 'Nice work.',
          expandedCueExerciseId: 'some-exercise-never-in-this-session',
          expandedCueText: 'irrelevant',
        },
        cacheReadInputTokens: 0,
      },
      {
        parsedOutput: {
          rewrittenExplanation: 'Still trying to name the wrong exercise.',
          expandedCueExerciseId: 'some-exercise-never-in-this-session',
          expandedCueText: 'irrelevant',
        },
        cacheReadInputTokens: 0,
      },
    );
    const result = await runCoachVoiceJob(parse, {
      deterministicExplanation: 'Push-ups moved up to Level 5.',
      sessionExerciseIds: SESSION_IDS,
    });
    expect(calls).toHaveLength(2); // one repair attempt
    expect(result.usedFallback).toBe(true);
    expect(result.explanation).toBe('Push-ups moved up to Level 5.');
    expect(result.expandedCue).toBeNull();
  });

  it('falls back to the deterministic explanation on an empty rewritten explanation', async () => {
    const { parse } = fakeParse(
      { parsedOutput: { rewrittenExplanation: '' }, cacheReadInputTokens: 0 },
      { parsedOutput: { rewrittenExplanation: '' }, cacheReadInputTokens: 0 },
    );
    const result = await runCoachVoiceJob(parse, {
      deterministicExplanation: 'Push-ups moved up to Level 5.',
      sessionExerciseIds: SESSION_IDS,
    });
    expect(result.usedFallback).toBe(true);
    expect(result.explanation).toBe('Push-ups moved up to Level 5.');
  });
});
