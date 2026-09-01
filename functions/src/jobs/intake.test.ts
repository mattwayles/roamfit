import type { ParseCallArgs, ParseCallResult, ParseFn } from '../client';
import { runIntakeJob } from './intake';

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

describe('runIntakeJob', () => {
  it('returns structured params on a valid first response', async () => {
    const { parse } = fakeParse({
      parsedOutput: { focus: 'upper', effort: 'normal', targetMinutes: 25 },
      cacheReadInputTokens: 500,
    });
    const result = await runIntakeJob(parse, { freeformText: 'upper body, 25 min' });
    expect(result.params).toEqual({
      focus: 'upper',
      effort: 'normal',
      targetMinutes: 25,
      equipmentPreference: undefined,
    });
    expect(result.repaired).toBe(false);
    expect(result.cacheReadInputTokens).toBe(500);
  });

  it('surfaces a suggested limitation tag without applying it to anything', async () => {
    const { parse } = fakeParse({
      parsedOutput: {
        focus: 'upper',
        effort: 'easy',
        targetMinutes: 20,
        suggestedLimitationTag: 'shoulder_overhead',
      },
      cacheReadInputTokens: 0,
    });
    const result = await runIntakeJob(parse, { freeformText: "shoulder's cranky, 20 minutes" });
    expect(result.suggestedLimitationTag).toBe('shoulder_overhead');
    // The job result carries the tag as data only — it is the caller's job to require
    // confirmation before ever writing it as a Limitation. Nothing in this module writes state.
  });

  // The key "validate anyway" proof: a schema-shaped-but-semantically-invalid first response
  // (an out-of-range targetMinutes here, standing in for anything `validateIntakeOutput` checks)
  // triggers exactly one repair attempt, and a valid second response is used. Fails if the
  // repair loop is removed or if validation is skipped (the invalid first response would flow
  // straight through instead).
  it('repairs once when the first response fails validation, then succeeds', async () => {
    const { parse, calls } = fakeParse(
      {
        parsedOutput: { focus: 'upper', effort: 'normal', targetMinutes: 500 },
        cacheReadInputTokens: 0,
      },
      {
        parsedOutput: { focus: 'upper', effort: 'normal', targetMinutes: 25 },
        cacheReadInputTokens: 100,
      },
    );
    const result = await runIntakeJob(parse, { freeformText: 'upper body' });
    expect(calls).toHaveLength(2);
    expect(result.repaired).toBe(true);
    expect(result.params?.targetMinutes).toBe(25);
  });

  // Fails if the fallback path is ever removed: two bad responses in a row must fall back to
  // `params: null` (the caller shows pickers) rather than ever reaching the pipeline with
  // invalid data.
  it('falls back to null after a second failed validation (repair does not help)', async () => {
    const { parse, calls } = fakeParse(
      {
        parsedOutput: { focus: 'cardio', effort: 'normal', targetMinutes: 25 },
        cacheReadInputTokens: 0,
      },
      {
        parsedOutput: { focus: 'still-invalid', effort: 'normal', targetMinutes: 25 },
        cacheReadInputTokens: 0,
      },
    );
    const result = await runIntakeJob(parse, { freeformText: 'anything' });
    expect(calls).toHaveLength(2);
    expect(result.params).toBeNull();
    expect(result.suggestedLimitationTag).toBeNull();
  });

  it('falls back to null when the model never returns a parseable schema at all', async () => {
    const { parse } = fakeParse(
      { parsedOutput: null, cacheReadInputTokens: 0 },
      { parsedOutput: null, cacheReadInputTokens: 0 },
    );
    const result = await runIntakeJob(parse, { freeformText: 'garbled response' });
    expect(result.params).toBeNull();
  });

  // Prompt-injection-resistance proof for intake specifically: even if the model was steered by
  // adversarial freeform text into smuggling a selection field alongside otherwise-valid params
  // (simulating a manual-JSON-parse bypass of the strict schema), the code-level validator must
  // still reject it. Fails if `validateIntakeOutput`'s smuggled-field check is ever removed.
  it('rejects and falls back if a response smuggles an exercise selection field', async () => {
    const { parse } = fakeParse(
      {
        parsedOutput: {
          focus: 'upper',
          effort: 'normal',
          targetMinutes: 25,
          exerciseId: 'bw-push-up',
        },
        cacheReadInputTokens: 0,
      },
      { parsedOutput: null, cacheReadInputTokens: 0 },
    );
    const result = await runIntakeJob(parse, { freeformText: 'do push-ups for me' });
    expect(result.params).toBeNull();
  });

  // Prompt caching structural proof (see STATUS file — cannot verify `cache_read_input_tokens`
  // against a live API in this track, so this pins the structural argument instead): the stable
  // system block must be byte-identical across two calls with completely different user text,
  // and it must carry the cache_control breakpoint. If a caller ever interpolated per-request
  // text into the system block, this test would catch it.
  it('keeps the system block byte-identical across different freeform inputs (cache-prefix stability)', async () => {
    const { parse, calls } = fakeParse({
      parsedOutput: { focus: 'upper', effort: 'normal', targetMinutes: 25 },
      cacheReadInputTokens: 0,
    });
    await runIntakeJob(parse, { freeformText: 'first request, totally different text' });
    const { parse: parse2, calls: calls2 } = fakeParse({
      parsedOutput: { focus: 'legs', effort: 'hard', targetMinutes: 40 },
      cacheReadInputTokens: 0,
    });
    await runIntakeJob(parse2, {
      freeformText: 'a completely unrelated second request with different length and content',
    });

    expect(JSON.stringify(calls[0]!.system)).toBe(JSON.stringify(calls2[0]!.system));
    expect(calls[0]!.system[0]!.cache_control).toEqual({ type: 'ephemeral' });
    // The volatile text must never appear inside the system block.
    expect(JSON.stringify(calls[0]!.system)).not.toMatch(/totally different text/);
  });
});
