import { createRng, seedFromString, daysBetween, addDays, ENGINE_VERSION } from './index';

describe('@roamfit/engine wiring (no RN, no I/O)', () => {
  it('exports a working seeded RNG', () => {
    const rng = createRng(seedFromString('test-seed'));
    const a = rng.next();
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
  });

  it('same seed produces the same sequence (determinism)', () => {
    const seed = seedFromString('fixed');
    const r1 = createRng(seed);
    const r2 = createRng(seed);
    const seq1 = [r1.next(), r1.next(), r1.next()];
    const seq2 = [r2.next(), r2.next(), r2.next()];
    expect(seq1).toEqual(seq2);
  });

  it('local_date math never touches wall-clock UTC time', () => {
    expect(daysBetween('2026-08-28', '2026-08-30')).toBe(2);
    expect(addDays('2026-08-30', 1)).toBe('2026-08-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('carries an engine version for Session.engine_version reproducibility', () => {
    expect(typeof ENGINE_VERSION).toBe('string');
  });
});
