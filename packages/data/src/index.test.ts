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
  // ORCHESTRATION.md issue #33's corrected text: of the 3 `focus: upper` warmups that survived a
  // shoulder_overhead limitation at the time, 2 (`wu-cat-cow`, `wu-world-greatest`) are
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
      .filter((e) => e.roles.includes('warmup'))
      .filter((e) => e.focus.includes('upper'))
      .filter((e) => survivesShoulderOverhead(e.id))
      .filter((e) => e.primary.some((m) => SHOULDER_MUSCLES.includes(m)))
      .map((e) => e.id);
  }

  it('has strictly more genuinely shoulder-specific focus:upper warmups than the pre-track library', () => {
    // The pre-track baseline was exactly 1 survivor, `wu-pull-apart` — a purpose-built warm-up
    // duplicate of `pull-apart` that no longer exists: track 13 made a role a property of the
    // record, so the real Band Pull-Apart now carries `roles: ['main', 'warmup']` and there is
    // one exercise where there were two. The baseline id therefore moved to its survivor; the
    // measure itself is unchanged.
    const survivors = genuinelyShoulderSpecificUpperSurvivors();
    expect(survivors).toContain('pull-apart');
    expect(survivors.length).toBeGreaterThan(1);
  });

  it('the shoulder-safe warmups authored for track 6g survive the shoulder_overhead hard filter', () => {
    // Same list as track 6g authored, mapped onto the surviving records (see above):
    // `wu-scap-push-up` -> `bw-scap-push-up` is deliberately ABSENT. The two records disagreed on
    // contraindications for one movement — the purpose-built warm-up was tagged only
    // `wrist_extension`, the library record `shoulder_overhead` too — and merging them kept the
    // stricter tagging. Loosening a §13.2 safety tag is not something a refactor gets to do as a
    // side effect (invariant 3); if scapular push-ups really are shoulder-overhead-safe, that is a
    // content decision to make deliberately, and it is parked in the backlog.
    const shoulderSafeWarmups = [
      'wu-band-external-rotation',
      'wu-thread-the-needle',
      'pull-apart',
      'door-row',
    ];
    for (const id of shoulderSafeWarmups) {
      const ex = exerciseLibrary.exercises.find((e) => e.id === id);
      expect(ex).toBeDefined();
      expect(ex!.roles).toContain('warmup');
      expect(survivesShoulderOverhead(id)).toBe(true);
    }
    const survivors = genuinelyShoulderSpecificUpperSurvivors();
    for (const id of shoulderSafeWarmups) {
      expect(survivors).toContain(id);
    }
  });

  it('at least one of them also survives a shoulder_horizontal limitation', () => {
    const survivesBoth = ['wu-band-external-rotation', 'wu-thread-the-needle', 'pull-apart'].filter(
      (id) => {
        const ex = exerciseLibrary.exercises.find((e) => e.id === id);
        return !!ex && !ex.contraindications.includes('shoulder_horizontal');
      },
    );
    expect(survivesBoth.length).toBeGreaterThanOrEqual(1);
  });
});
