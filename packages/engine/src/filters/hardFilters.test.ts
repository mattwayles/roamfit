import { exerciseLibrary } from '@roamfit/data';
import { applyHardFilters, DEFAULT_ANCHORS_AVAILABLE, effortCapForExercise } from './hardFilters';

const lib = exerciseLibrary.exercises;

describe('hard filters (§5.1 step 1 / §13.2)', () => {
  it('never returns an exercise whose anchor is not enabled (§13.1 default-off)', () => {
    const out = applyHardFilters({
      library: lib,
      request: {},
      anchorsAvailable: DEFAULT_ANCHORS_AVAILABLE,
      limitations: [],
      today: '2026-08-30',
    });
    // The real invariant: nothing appears whose anchor the user has not enabled.
    expect(out.every((e) => DEFAULT_ANCHORS_AVAILABLE.includes(e.anchor))).toBe(true);
    // §5.3 says all bodyweight_bearing anchors are off by default. ADR 0007 carves out exactly
    // one documented exception — `low-bar` (bw-inverted-row), which is on by default while
    // staying bodyweight_bearing so the §13.1 effort cap still binds. Pin that the carve-out is
    // exactly one anchor wide, so a future edit cannot quietly widen it.
    const bearing = out.filter((e) => e.anchor_class === 'bodyweight_bearing');
    expect([...new Set(bearing.map((e) => e.anchor))]).toEqual(['low-bar']);
    expect(bearing.every((e) => effortCapForExercise(e, 'hard') === 'normal')).toBe(true);
  });

  it('includes bodyweight_bearing exercises once the anchor is explicitly enabled', () => {
    const out = applyHardFilters({
      library: lib,
      request: {},
      anchorsAvailable: [...DEFAULT_ANCHORS_AVAILABLE, 'pullup-bar', 'body-support'],
      limitations: [],
      today: '2026-08-30',
    });
    expect(out.some((e) => e.anchor_class === 'bodyweight_bearing')).toBe(true);
  });

  it('removes any exercise whose contraindications intersect an active limitation, and never as a hint', () => {
    const withShoulder = lib.filter((e) => e.contraindications.includes('shoulder_overhead'));
    expect(withShoulder.length).toBeGreaterThan(0);
    const out = applyHardFilters({
      library: lib,
      request: {},
      anchorsAvailable: DEFAULT_ANCHORS_AVAILABLE,
      limitations: [{ tag: 'shoulder_overhead', createdAt: '2026-01-01', source: 'user' }],
      today: '2026-08-30',
    });
    expect(out.some((e) => e.contraindications.includes('shoulder_overhead'))).toBe(false);
  });

  it('ignores an expired limitation', () => {
    const withShoulder = lib.filter((e) => e.contraindications.includes('shoulder_overhead'));
    const out = applyHardFilters({
      library: lib,
      request: {},
      anchorsAvailable: DEFAULT_ANCHORS_AVAILABLE,
      limitations: [
        {
          tag: 'shoulder_overhead',
          createdAt: '2026-01-01',
          source: 'pain_report',
          expiresAt: '2026-01-15',
        },
      ],
      today: '2026-08-30',
    });
    expect(out.some((e) => e.contraindications.includes('shoulder_overhead'))).toBe(
      withShoulder.length > 0,
    );
  });

  it('restricts to bodyweight when equipmentPreference=bodyweight', () => {
    const out = applyHardFilters({
      library: lib,
      request: { equipmentPreference: 'bodyweight' },
      anchorsAvailable: DEFAULT_ANCHORS_AVAILABLE,
      limitations: [],
      today: '2026-08-30',
    });
    expect(out.every((e) => e.equipment === 'bodyweight')).toBe(true);
  });

  it('caps a bodyweight_bearing exercise at normal even when the day is hard', () => {
    const bwBearing = lib.find((e) => e.anchor_class === 'bodyweight_bearing');
    expect(bwBearing).toBeDefined();
    expect(effortCapForExercise(bwBearing!, 'hard')).toBe('normal');
  });

  it('does not cap a non-bodyweight_bearing exercise', () => {
    const other = lib.find((e) => e.anchor_class !== 'bodyweight_bearing');
    expect(other).toBeDefined();
    expect(effortCapForExercise(other!, 'hard')).toBe('hard');
  });
});
