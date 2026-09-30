import { hashSeed } from './seed';
import { exerciseComplete, greetingFor, lastSet, pick, rest, setComplete } from './hypeCopy';

describe('hypeCopy pools', () => {
  it('match the DESIGN.md §6 pools', () => {
    expect(setComplete).toHaveLength(8);
    expect(exerciseComplete).toHaveLength(4);
    expect(rest).toHaveLength(6);
    expect(lastSet).toEqual(['Last set. Empty the tank.']);
  });

  it('carry no guilt language', () => {
    const all = [...setComplete, ...exerciseComplete, ...lastSet, ...rest].join(' ').toLowerCase();
    expect(all).not.toMatch(/miss|streak|fail|lazy|behind/);
  });
});

describe('pick', () => {
  it('is deterministic for a given seed', () => {
    expect(pick(setComplete, 'abc')).toBe(pick(setComplete, 'abc'));
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
  });

  it('always returns a member of the pool and reaches most of it across seeds', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const line = pick(setComplete, `set-${i}`);
      expect(setComplete).toContain(line);
      seen.add(line);
    }
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });

  it('accepts numeric seeds and a single-item pool', () => {
    expect(pick(lastSet, 7)).toBe('Last set. Empty the tank.');
    expect(pick(rest, 3)).toBe(pick(rest, '3'));
  });

  it('throws on an empty pool', () => {
    expect(() => pick([], 'x')).toThrow();
  });
});

describe('greetingFor', () => {
  const at = (h: number) => new Date(2026, 8, 29, h, 30);

  it('uses the local hour of day', () => {
    expect(greetingFor(at(6))).toBe('Good morning');
    expect(greetingFor(at(11))).toBe('Good morning');
    expect(greetingFor(at(12))).toBe('Good afternoon');
    expect(greetingFor(at(16))).toBe('Good afternoon');
    expect(greetingFor(at(17))).toBe('Good evening');
    expect(greetingFor(at(22))).toBe('Good evening');
    expect(greetingFor(at(2))).toBe('Good evening');
  });
});
