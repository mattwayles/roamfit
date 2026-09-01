import { getApiKeyOrThrow } from './config';

describe('getApiKeyOrThrow', () => {
  it('throws with a clear operator-facing message when unset', () => {
    expect(() => getApiKeyOrThrow({})).toThrow(/ANTHROPIC_API_KEY is not set/);
  });

  it('returns the key when present in the given environment, without ever logging it', () => {
    const key = getApiKeyOrThrow({ ANTHROPIC_API_KEY: 'test-fixture-only-not-a-real-key' });
    expect(key).toBe('test-fixture-only-not-a-real-key');
  });

  it('defaults to process.env and does not require an explicit argument', () => {
    const original = process.env.ANTHROPIC_API_KEY;
    try {
      delete process.env.ANTHROPIC_API_KEY;
      expect(() => getApiKeyOrThrow()).toThrow();
    } finally {
      if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = original;
    }
  });
});
