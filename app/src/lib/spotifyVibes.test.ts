import { FITNESS_NAME, SPOTIFY_VIBES, isKnownVibeId, resolveVibeQueries } from './spotifyVibes';

const vibe = (id: string) => SPOTIFY_VIBES.find((v) => v.id === id)!;

describe('SPOTIFY_VIBES', () => {
  it('has unique ids', () => {
    const ids = SPOTIFY_VIBES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the shipped ids stable', () => {
    expect(SPOTIFY_VIBES.map((v) => v.id)).toEqual([
      'anything',
      'rock',
      'metal',
      'hiphop',
      'electronic',
      'punk',
      'classic-rock',
      'alternative',
      'country',
      'pop',
      '80s',
      '90s',
      '2000s',
    ]);
  });

  it('gives every term a word the playlist-name filter matches, with no duplicate terms per vibe', () => {
    for (const v of SPOTIFY_VIBES) {
      expect(new Set(v.terms).size).toBe(v.terms.length);
      expect(v.terms.length).toBeGreaterThanOrEqual(5);
      for (const t of v.terms) expect(FITNESS_NAME.test(t)).toBe(true);
    }
  });
});

describe('resolveVibeQueries', () => {
  it('falls back to the anything vibe for empty or all-unknown ids', () => {
    expect(resolveVibeQueries([])).toEqual(vibe('anything').terms);
    expect(resolveVibeQueries(['nope', 'also-nope'])).toEqual(vibe('anything').terms);
  });

  it('unions the terms of several vibes without duplicates', () => {
    expect(resolveVibeQueries(['rock', 'metal', 'rock'])).toEqual([
      ...vibe('rock').terms,
      ...vibe('metal').terms,
    ]);
  });

  it('ignores unknown ids next to known ones', () => {
    expect(resolveVibeQueries(['bogus', 'rock'])).toEqual(vibe('rock').terms);
  });
});

describe('isKnownVibeId', () => {
  it('recognises catalog ids only', () => {
    expect(isKnownVibeId('90s')).toBe(true);
    expect(isKnownVibeId('90S')).toBe(false);
    expect(isKnownVibeId('')).toBe(false);
  });
});
