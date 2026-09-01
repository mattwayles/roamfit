/**
 * Issue #36 — §7.3's caching done-criterion is "verify with `cache_read_input_tokens`," and it
 * can't be genuinely verified without a live key and a real deployment (see the operator
 * runbook). What this repo *can* prove: the value the job layer already computes actually
 * survives to somewhere an operator watching Cloud Logging after a real deploy can read it, not
 * just to the returned object a test asserts against. `handleIntake`/`handleCoachVoice`/
 * `handleDistillFeedback` are the testable half of each `onCall` wrapper (injected `ParseFn`,
 * same seam every `src/jobs/*.test.ts` already uses) — this file asserts the structured
 * `llm_proxy_call` log line fires with the real `cacheReadInputTokens` value on every call,
 * pass or fail, repaired or not.
 */
import type { ParseCallArgs, ParseCallResult, ParseFn } from './client';
import { handleCoachVoice, handleDistillFeedback, handleIntake, type LogSink } from './handlers';

function fakeParse(...results: Array<ParseCallResult<unknown>>): ParseFn {
  let i = 0;
  return jest.fn(async (_args: ParseCallArgs<unknown>) => {
    const result = results[Math.min(i, results.length - 1)];
    i++;
    return result;
  }) as unknown as ParseFn;
}

describe('issue #36 — cache_read_input_tokens is logged, not just returned', () => {
  let infoSpy: jest.Mock;
  let log: LogSink;

  beforeEach(() => {
    infoSpy = jest.fn();
    log = infoSpy as unknown as LogSink;
  });

  it('handleIntake logs the real cacheReadInputTokens value from the job result', async () => {
    const parse = fakeParse({
      parsedOutput: { focus: 'upper', effort: 'normal', targetMinutes: 25 },
      cacheReadInputTokens: 1234,
    });
    await handleIntake(parse, { freeformText: 'upper body, 25 min' }, log);

    expect(infoSpy).toHaveBeenCalledWith(
      'llm_proxy_call',
      expect.objectContaining({ job: 'intake', cacheReadInputTokens: 1234, usedFallback: false }),
    );
  });

  it('handleCoachVoice logs cacheReadInputTokens even when the job falls back', async () => {
    // Two invalid responses in a row (schema parse fails) forces the documented
    // repair-then-deterministic-fallback path — the log line must still fire and still report
    // whatever cache value came back, not silently skip logging on a fallback.
    const parse = fakeParse(
      { parsedOutput: null, cacheReadInputTokens: 7 },
      { parsedOutput: null, cacheReadInputTokens: 3 },
    );
    await handleCoachVoice(
      parse,
      {
        deterministicExplanation: 'Same weight, one more rep than last time.',
        sessionExerciseIds: ['bw-push-up'],
      },
      log,
    );

    expect(infoSpy).toHaveBeenCalledWith(
      'llm_proxy_call',
      expect.objectContaining({
        job: 'coachVoice',
        cacheReadInputTokens: 3,
        repaired: true,
        usedFallback: true,
      }),
    );
  });

  it('handleDistillFeedback logs a real call (non-empty retrospective, not the empty-text short-circuit)', async () => {
    const parse = fakeParse({
      parsedOutput: { bandTooLightExerciseIds: [], aversionExerciseIds: [] },
      cacheReadInputTokens: 42,
    });
    await handleDistillFeedback(
      parse,
      {
        retrospectiveText: 'Felt great today, band was maybe a touch light on rows.',
        sessionExerciseIds: ['band-row'],
      },
      log,
    );

    expect(infoSpy).toHaveBeenCalledWith(
      'llm_proxy_call',
      expect.objectContaining({ job: 'distillFeedback', cacheReadInputTokens: 42 }),
    );
  });
});
