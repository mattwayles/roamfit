import { exerciseLibrary } from '@roamfit/data';
import {
  ALWAYS_AVAILABLE_ANCHORS,
  applyHardFilters,
  DEFAULT_ANCHORS_AVAILABLE,
  difficultyCapForExercise,
} from './hardFilters';

const lib = exerciseLibrary.exercises;

describe('hard filters (§5.1 step 1 / §13.2)', () => {
  it('never returns an exercise whose anchor is not enabled', () => {
    const out = applyHardFilters({
      library: lib,
      request: {},
      anchorsAvailable: DEFAULT_ANCHORS_AVAILABLE,
      limitations: [],
      disabledExerciseIds: new Set(),
      today: '2026-08-30',
    });
    // The real invariant: nothing appears whose anchor the user has not enabled, except the
    // always-eligible anchors (bodyweight, and band exercises needing no fixed point) — those
    // are never gated by anchorsAvailable at all.
    expect(
      out.every(
        (e) =>
          DEFAULT_ANCHORS_AVAILABLE.includes(e.anchor) ||
          ALWAYS_AVAILABLE_ANCHORS.includes(e.anchor),
      ),
    ).toBe(true);
    // §5.3: every anchor the "Available Equipment" picker offers is checked by default, so
    // bodyweight_bearing exercises (pull-ups, dips, low-bar hangs, ...) DO appear by default now
    // — the §13.1 safety cap lives entirely in `difficultyCapForExercise`, not in whether the
    // anchor is enabled.
    const bearing = out.filter((e) => e.anchor_class === 'bodyweight_bearing');
    expect(bearing.length).toBeGreaterThan(0);
    expect(bearing.every((e) => difficultyCapForExercise(e, 'hard') === 'medium')).toBe(true);
  });

  it('excludes bodyweight_bearing exercises once the user disables that anchor', () => {
    const withoutBarAndBench = DEFAULT_ANCHORS_AVAILABLE.filter(
      (a) => a !== 'pullup-bar' && a !== 'body-support',
    );
    const out = applyHardFilters({
      library: lib,
      request: {},
      anchorsAvailable: withoutBarAndBench,
      limitations: [],
      disabledExerciseIds: new Set(),
      today: '2026-08-30',
    });
    expect(out.some((e) => e.anchor === 'pullup-bar' || e.anchor === 'body-support')).toBe(false);
  });

  it('accepts anchor_alt as a genuine alternative to anchor — either being available is enough', () => {
    // Banded Bear Crawl: anchor "anchor-low", anchor_alt "anchor-mid".
    const bearCrawl = lib.find((e) => e.id === 'bear-crawl')!;
    expect(bearCrawl.anchor).toBe('anchor-low');
    expect(bearCrawl.anchor_alt).toBe('anchor-mid');

    const onlyMid = applyHardFilters({
      library: lib,
      request: {},
      anchorsAvailable: ['anchor-mid'],
      limitations: [],
      disabledExerciseIds: new Set(),
      today: '2026-08-30',
    });
    expect(onlyMid.some((e) => e.id === 'bear-crawl')).toBe(true);

    const neither = applyHardFilters({
      library: lib,
      request: {},
      anchorsAvailable: ['anchor-high'],
      limitations: [],
      disabledExerciseIds: new Set(),
      today: '2026-08-30',
    });
    expect(neither.some((e) => e.id === 'bear-crawl')).toBe(false);
  });

  it('removes any exercise whose contraindications intersect an active limitation, and never as a hint', () => {
    const withShoulder = lib.filter((e) => e.contraindications.includes('shoulder_overhead'));
    expect(withShoulder.length).toBeGreaterThan(0);
    const out = applyHardFilters({
      library: lib,
      request: {},
      anchorsAvailable: DEFAULT_ANCHORS_AVAILABLE,
      limitations: [{ tag: 'shoulder_overhead', createdAt: '2026-01-01', source: 'user' }],
      disabledExerciseIds: new Set(),
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
      disabledExerciseIds: new Set(),
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
      disabledExerciseIds: new Set(),
      today: '2026-08-30',
    });
    expect(out.every((e) => e.equipment === 'bodyweight')).toBe(true);
  });

  it('caps a bodyweight_bearing exercise at normal even when the day is hard', () => {
    const bwBearing = lib.find((e) => e.anchor_class === 'bodyweight_bearing');
    expect(bwBearing).toBeDefined();
    expect(difficultyCapForExercise(bwBearing!, 'hard')).toBe('medium');
  });

  it('does not cap a non-bodyweight_bearing exercise', () => {
    const other = lib.find((e) => e.anchor_class !== 'bodyweight_bearing');
    expect(other).toBeDefined();
    expect(difficultyCapForExercise(other!, 'hard')).toBe('hard');
  });

  it('removes an exercise the user has explicitly disabled, permanently and regardless of other filters', () => {
    const target = lib[0];
    const out = applyHardFilters({
      library: lib,
      request: {},
      anchorsAvailable: DEFAULT_ANCHORS_AVAILABLE,
      limitations: [],
      disabledExerciseIds: new Set([target.id]),
      today: '2026-08-30',
    });
    expect(out.some((e) => e.id === target.id)).toBe(false);
  });

  it('re-includes a disabled exercise once its id is no longer in the set', () => {
    const target = lib[0];
    const out = applyHardFilters({
      library: lib,
      request: {},
      anchorsAvailable: DEFAULT_ANCHORS_AVAILABLE,
      limitations: [],
      disabledExerciseIds: new Set(),
      today: '2026-08-30',
    });
    expect(out.some((e) => e.id === target.id)).toBe(
      DEFAULT_ANCHORS_AVAILABLE.includes(target.anchor) ||
        ALWAYS_AVAILABLE_ANCHORS.includes(target.anchor),
    );
  });
});
