import { exerciseLibrary, familyLibrary } from './index';

describe('@roamfit/data wiring', () => {
  it('loads the bundled exercise library', () => {
    expect(exerciseLibrary.exercises.length).toBeGreaterThan(0);
  });

  it('loads the bundled family library', () => {
    expect(Array.isArray(familyLibrary.families)).toBe(true);
  });
});

describe('warm-up variety for a shoulder_overhead limitation (issue #33, track 6g-warmups)', () => {
  // §13.2's hard filter drops any exercise whose contraindications[] includes the limitation's
  // tag, before anything else runs. This mirrors that for a single `shoulder_overhead`
  // limitation, over just the warmup pool.
  function survivesShoulderOverhead(id: string) {
    const ex = exerciseLibrary.exercises.find((e) => e.id === id);
    return !!ex && !ex.contraindications.includes('shoulder_overhead');
  }

  // Per the contraindications review sign-off (docs/review/contraindications-review.md) and
  // ORCHESTRATION.md issue #33's corrected text: of the 3 pre-existing `focus: upper` warmups
  // that survive a shoulder_overhead limitation, 2 (`wu-cat-cow`, `wu-world-greatest`) are
  // spine/hip mobility drills that merely happen to carry `focus: upper` — their `primary` mover
  // is `lower_back` / `hip_flexors`, not a shoulder-region muscle. `wu-pull-apart` is the only
  // genuinely shoulder-specific survivor. This set (not a pattern bucket, which would exclude a
  // legitimately shoulder-relevant thoracic-rotation drill tagged `anti_rotation` for consistency
  // with `cd-thoracic-rotation`) is what "genuinely shoulder-specific" means below — matching the
  // orchestrator's own stated reasoning for why cat-cow/world's-greatest don't count.
  const SHOULDER_MUSCLES = [
    'front_delts',
    'rear_delts',
    'side_delts',
    'upper_back',
    'traps',
    'lats',
    'chest',
    'biceps',
    'triceps',
  ];

  function genuinelyShoulderSpecificUpperSurvivors(): string[] {
    return exerciseLibrary.exercises
      .filter((e) => e.role === 'warmup')
      .filter((e) => e.focus.includes('upper'))
      .filter((e) => survivesShoulderOverhead(e.id))
      .filter((e) => e.primary.some((m) => SHOULDER_MUSCLES.includes(m)))
      .map((e) => e.id);
  }

  it('has strictly more genuinely shoulder-specific focus:upper warmups than the pre-track library', () => {
    // Fails on the library as committed before this track (docs/review/contraindications-review.md
    // sign-off, ORCHESTRATION.md issue #33): exactly 1 survivor, `wu-pull-apart`. Re-verify that
    // baseline explicitly (not just implicitly through the >1 bound) so a future change to the
    // muscle-group filter can't silently make this assertion vacuous.
    const survivors = genuinelyShoulderSpecificUpperSurvivors();
    // The pre-track baseline this must beat. If this ever fails, the "genuinely shoulder-specific"
    // definition above has drifted from what issue #33 measured, not that new content is missing.
    expect(survivors).toContain('wu-pull-apart');
    expect(survivors.length).toBeGreaterThan(1);
  });

  it('the new shoulder-safe warmups authored for this track survive the shoulder_overhead hard filter', () => {
    const newIds = [
      'wu-scap-push-up',
      'wu-band-external-rotation',
      'wu-thread-the-needle',
      'wu-band-row',
    ];
    for (const id of newIds) {
      const ex = exerciseLibrary.exercises.find((e) => e.id === id);
      expect(ex).toBeDefined();
      expect(survivesShoulderOverhead(id)).toBe(true);
    }
    // And they're counted as genuinely shoulder-specific by the same measure as wu-pull-apart —
    // not just present in the pool.
    const survivors = genuinelyShoulderSpecificUpperSurvivors();
    for (const id of newIds) {
      expect(survivors).toContain(id);
    }
  });

  it('at least one new warmup also survives a shoulder_horizontal limitation', () => {
    const newIds = [
      'wu-scap-push-up',
      'wu-band-external-rotation',
      'wu-thread-the-needle',
      'wu-band-row',
    ];
    const survivesBoth = newIds.filter((id) => {
      const ex = exerciseLibrary.exercises.find((e) => e.id === id);
      return !!ex && !ex.contraindications.includes('shoulder_horizontal');
    });
    expect(survivesBoth.length).toBeGreaterThanOrEqual(1);
  });
});
