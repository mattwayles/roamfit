import { exerciseLibrary, familyLibrary, figureLibrary } from './index';

describe('@roamfit/data wiring', () => {
  it('loads the bundled exercise library', () => {
    expect(exerciseLibrary.exercises.length).toBeGreaterThan(0);
  });

  it('loads the bundled family library', () => {
    expect(Array.isArray(familyLibrary.families)).toBe(true);
  });
});

describe('figureLibrary (§11.4 tier 2 — bundled in-house line-art figures)', () => {
  it('has a bundled SVG figure for every exercise (100% offline coverage)', () => {
    for (const exercise of exerciseLibrary.exercises) {
      expect(figureLibrary[exercise.id]).toBeDefined();
      expect(figureLibrary[exercise.id]).toContain('<svg');
    }
  });

  it('has no figure entries that reference an unknown exercise id', () => {
    const exerciseIds = new Set(exerciseLibrary.exercises.map((e) => e.id));
    for (const figureId of Object.keys(figureLibrary)) {
      expect(exerciseIds.has(figureId)).toBe(true);
    }
  });

  it('stays well under the 3 MB bundled media budget', () => {
    const bytes = Buffer.byteLength(JSON.stringify(figureLibrary), 'utf8');
    expect(bytes).toBeLessThan(3 * 1024 * 1024);
  });

  it('never bundles a video_id inside a figure (invariant 8 — never invent a YouTube id)', () => {
    for (const svg of Object.values(figureLibrary)) {
      expect(svg).not.toMatch(/youtube|video_id/i);
    }
  });

  it('has real pose variety, not one drawing wearing 200 captions', () => {
    // Regression guard for the orchestrator's Finding 1 (200 exercises originally collapsed into
    // 57 distinct geometries after stripping <title>; a second review round found and fixed
    // several more archetype-assignment bugs, reaching 135/200 — see STATUS-6a-figures.md).
    // Threshold set below the current count so it fails loudly if a future edit collapses
    // variety back down, without pinning the exact number.
    const distinctGeometries = new Set(
      Object.values(figureLibrary).map((svg) => svg.replace(/<title>.*?<\/title>/, '')),
    );
    expect(distinctGeometries.size).toBeGreaterThanOrEqual(125);
  });

  it(
    'draws an isometric hold (metric === "time") as a single pose with a hold glyph, not a ' +
      'two-pose overlay with a movement arrow',
    () => {
      // Regression guard for Finding 4. A hold figure has no panel divider and no red movement
      // arrow; a dynamic (reps/amrap) figure has both.
      const holdIds = exerciseLibrary.exercises.filter((e) => e.metric === 'time').map((e) => e.id);
      expect(holdIds.length).toBeGreaterThan(0);
      for (const id of holdIds) {
        const svg = figureLibrary[id];
        expect(svg).not.toContain('stroke="#e2e8f0" stroke-width="2"'); // the panel divider
        expect(svg).not.toContain('fill="#b91c1c"'); // the movement-arrow head
      }
    },
  );

  it('draws a dynamic (non-hold) figure as two panels with a movement arrow between them', () => {
    // Regression guard for Finding 3 (superimposed start/end poses were an unreadable tangle).
    const dynamicIds = exerciseLibrary.exercises
      .filter((e) => e.metric !== 'time')
      .map((e) => e.id);
    expect(dynamicIds.length).toBeGreaterThan(0);
    for (const id of dynamicIds) {
      const svg = figureLibrary[id];
      expect(svg).toContain('stroke="#e2e8f0" stroke-width="2"'); // the panel divider
      expect(svg).toContain('fill="#b91c1c"'); // the movement-arrow head
    }
  });

  it('gives the arm and leg different colors from each other and from the trunk (Finding 6)', () => {
    for (const svg of Object.values(figureLibrary)) {
      expect(svg).toContain('#0891b2'); // arm
      expect(svg).toContain('#7c3aed'); // leg
      expect(svg).toContain('#1e293b'); // trunk
    }
  });

  it('draws a visible band path (not a small stray mark) for every band exercise (Finding 5)', () => {
    const bandExercises = exerciseLibrary.exercises.filter((e) => e.equipment === 'band');
    expect(bandExercises.length).toBeGreaterThan(0);
    for (const exercise of bandExercises) {
      const svg = figureLibrary[exercise.id];
      // Every band figure draws at least one green band path or loop.
      expect(svg).toContain('#16a34a');
    }
  });

  it(
    'draws a fixed-anchor glyph (anchor-low/mid/high) within each panel it belongs to, not at ' +
      'a single hardcoded canvas position',
    () => {
      // Regression guard for a bug the orchestrator's re-review round found by rendering
      // band-sit-up: the anchor post used a hardcoded negative x meant for the left panel, so on
      // the right panel it drew off-canvas and the "band" became a long stray line spanning the
      // whole width, through the divider. Every anchor <rect> post (the vertical bar glyph) must
      // have a non-negative x within the full canvas (0..300).
      const fixedAnchorIds = exerciseLibrary.exercises
        .filter(
          (e) =>
            e.equipment === 'band' &&
            ['anchor-low', 'anchor-mid', 'anchor-high'].includes(e.anchor),
        )
        .map((e) => e.id);
      expect(fixedAnchorIds.length).toBeGreaterThan(0);
      for (const id of fixedAnchorIds) {
        const svg = figureLibrary[id];
        const rectXs = [...svg.matchAll(/<rect x="(-?[\d.]+)" y="8" width="6" height="144"/g)].map(
          (m) => Number(m[1]),
        );
        expect(rectXs.length).toBeGreaterThan(0);
        for (const x of rectXs) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(300);
        }
      }
    },
  );

  it('grounds every figure at the floor line, in both directions, except an explicit elevated allowlist', () => {
    // Round-4 regression guard, replacing round-3's marker-only, one-sided test (which only
    // checked hand/foot <circle r="2.8"> markers, and only that they weren't *below* the ground
    // line). The orchestrator found that test had two blind spots at once:
    //
    // 1. It permitted unlimited float *above* the line. 114+ figures had their nearest body
    //    geometry more than 6px above y=152 with nothing else touching down — worst cases
    //    40-82px (bw-boat-hold, mountain-climber, bw-pike-push-up, bw-dip, russian-twist,
    //    cd-hamstring-band/cd-figure-four, bw-nordic-curl, cd-cobra, kneeling-crunch/band-sit-up,
    //    bw-decline-push-up, and more) — a person floating in mid-air with nothing under them,
    //    which reads as broken exactly the way sinking through the floor does.
    // 2. It only ever looked at hand/foot <circle> markers, missing every archetype whose contact
    //    joint is the hip or shoulder instead (any "lying on the back/side" pose — the torso is
    //    flat and never gets its own marker) and any archetype where a path *midpoint* — an
    //    elbow, not an endpoint — is the deepest point (found while fixing pike-push-up: its
    //    bent elbow swung 5.4px through the floor while both hand and foot markers looked fine).
    //
    // This version parses every drawn coordinate — every <line> (except the decorative ground
    // line and panel divider, which are always at/near y=152 by construction and aren't body
    // geometry), every <circle> center, and every M/L point in every <path> (skipping any path
    // with a Q curve — the anchor-post arc glyph is deliberately drawn dipping a few px past its
    // own endpoints and isn't body geometry either) — and takes the single closest-to-ground
    // point in the whole figure, whatever joint or midpoint it turns out to be. That point must
    // land within a few px of y=152, above OR below, for every figure not on ELEVATED_ALLOWLIST.
    //
    // Verified against the actual bundled output before choosing the tolerance: across the 188
    // non-allowlisted figures, the closest point is between 1.5px below and 4.4px above the line
    // (hip-abduction's -1.5 is a pre-existing, harmless dip in its band-path decoration, not a
    // body joint — see that archetype's own code comment). BELOW_TOLERANCE/ABOVE_TOLERANCE below
    // are set from that actual measured range, not chosen to make a formula look good.
    const GROUND = 152;
    const BELOW_TOLERANCE = 2; // a body joint must never sink through the floor; this covers only the known decorative band-path dip
    const ABOVE_TOLERANCE = 6; // "a few px" of floating is an accepted simplification of this rig

    // Every exercise here is deliberately NOT grounded, with the specific reason it's fine as is.
    // Keeping this list short and pose-by-pose (not "everything horizontal_push touches") is the
    // point — an allowlist that swallows the whole flagged set would defeat this test's purpose.
    const ELEVATED_ALLOWLIST: Record<string, string> = {
      'bw-dead-hang':
        'dead_hang archetype: hanging from a bar, feet are meant to be off the ground.',
      'lat-pulldown':
        'vertical_pull archetype default: shared with bw-pull-up/bw-chin-up/bw-archer-pull-up, which hang from a bar and must NOT be grounded. One shared pose cannot ground the standing pulldown variant without also grounding (and breaking) the hanging ones — a rig/archetype-sharing limitation, not fixed this round.',
      'straight-arm-pulldown': 'Same vertical_pull archetype-sharing limitation as lat-pulldown.',
      'assisted-pull-up':
        'vertical_pull archetype default: hanging from a bar, feet legitimately off the ground.',
      'bw-pull-up':
        'vertical_pull archetype default: hanging from a bar, feet legitimately off the ground.',
      'bw-chin-up':
        'vertical_pull archetype default: hanging from a bar, feet legitimately off the ground.',
      'bw-archer-pull-up':
        'vertical_pull archetype default: hanging from a bar, feet legitimately off the ground.',
      'step-up':
        'elevated_front_step archetype: the working foot is correctly elevated on the step (platformUnder); this single-leg rig has no way to draw the stationary back/support foot on the ground (a pre-existing, documented simplification).',
      'bw-step-up': 'Same elevated_front_step single-leg limitation as step-up.',
      'hollow-hold':
        'flexion archetype reused: the cue is explicitly "arms and legs extended and hovering" — only the low back should touch, and the shared crunch-family leg shape (bent-knee-down, not the straight-leg extension this hold calls for) leaves a residual float consistent with the pose\'s own description, not a floating-with-nothing-under-it bug.',
      'bw-hollow-hold': 'Same flexion/hollow-body reasoning as hollow-hold.',
      'bw-diamond-push-up':
        "horizontal_push archetype plus a shoulderDelta tweak (elbows narrowed): the tweak nudges the hand a few px off the archetype's grounded baseline as a side effect; still reads as hands-on-the-floor at a glance.",
    };

    function numsFromMLPath(d: string): [number, number][] {
      if (/[qQ]/.test(d)) return []; // anchor-post arc glyph — decorative, not body geometry
      const nums = (d.match(/-?[\d.]+/g) ?? []).map(Number);
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
      return pts;
    }

    function closestToGround(svg: string): number {
      let maxY = -Infinity;
      for (const m of svg.matchAll(
        /<line ([^>]*x1="(-?[\d.]+)"[^>]*y1="(-?[\d.]+)"[^>]*x2="(-?[\d.]+)"[^>]*y2="(-?[\d.]+)"[^>]*)\/>/g,
      )) {
        const attrs = m[1];
        if (/stroke="#cbd5e1"/.test(attrs) || /stroke="#e2e8f0"/.test(attrs)) continue; // ground line / divider
        maxY = Math.max(maxY, Number(m[3]), Number(m[5]));
      }
      for (const m of svg.matchAll(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="(-?[\d.]+)"/g)) {
        maxY = Math.max(maxY, Number(m[2]));
      }
      for (const m of svg.matchAll(/<path d="([^"]+)"/g)) {
        for (const [, y] of numsFromMLPath(m[1])) maxY = Math.max(maxY, y);
      }
      return maxY;
    }

    const violations: string[] = [];
    let checkedAtLeastOneFigure = false;
    for (const exercise of exerciseLibrary.exercises) {
      if (exercise.id in ELEVATED_ALLOWLIST) continue;
      const svg = figureLibrary[exercise.id];
      if (!svg) continue;
      checkedAtLeastOneFigure = true;
      const maxY = closestToGround(svg);
      const gap = GROUND - maxY; // positive = above the line, negative = through it
      if (gap < -BELOW_TOLERANCE || gap > ABOVE_TOLERANCE) {
        violations.push(
          `${exercise.id}: closest body point at y=${maxY.toFixed(1)} (${gap >= 0 ? gap.toFixed(1) + 'px above' : (-gap).toFixed(1) + 'px through'} the y=${GROUND} ground line)`,
        );
      }
    }
    expect(checkedAtLeastOneFigure).toBe(true);
    expect(violations).toEqual([]);
  });

  it('draws every piece of geometry inside the canvas viewBox (0..300 x 0..170)', () => {
    // Round-3 regression guard. The existing anchor-glyph test above only ever checked the
    // anchor post's x — it never looked at limb geometry, so it missed ten figures (the leg-
    // raise/reverse-crunch/flutter-kick/superman/prone-ytw/clamshell/russian-twist/dead-bug/
    // crunch/windshield-wiper/floor-press cluster) whose arm reached 4-18px past the right edge
    // of the 300-wide viewBox and got silently clipped (a slice through the head or an arm, not
    // an error — SVG viewBox crops without complaint). This test parses every line, circle
    // (center +/- radius), ellipse (center +/- rx/ry), rect (x/y/width/height), and path M/L
    // command coordinate out of the actual generated markup, so it catches an overflow on *any*
    // side from *any* drawing primitive, not just the one glyph the round-2 test happened to
    // check.
    const CANVAS_W = 300;
    const CANVAS_H = 170;

    function boundsOf(svg: string): { minX: number; maxX: number; minY: number; maxY: number } {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      const grow = (x: number, y: number) => {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      };
      for (const m of svg.matchAll(
        /<line x1="(-?[\d.]+)" y1="(-?[\d.]+)" x2="(-?[\d.]+)" y2="(-?[\d.]+)"/g,
      )) {
        grow(Number(m[1]), Number(m[2]));
        grow(Number(m[3]), Number(m[4]));
      }
      for (const m of svg.matchAll(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="(-?[\d.]+)"/g)) {
        const [cx, cy, r] = [Number(m[1]), Number(m[2]), Number(m[3])];
        grow(cx - r, cy - r);
        grow(cx + r, cy + r);
      }
      for (const m of svg.matchAll(
        /<ellipse cx="(-?[\d.]+)" cy="(-?[\d.]+)" rx="(-?[\d.]+)" ry="(-?[\d.]+)"/g,
      )) {
        const [cx, cy, rx, ry] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
        grow(cx - rx, cy - ry);
        grow(cx + rx, cy + ry);
      }
      for (const m of svg.matchAll(
        /<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="(-?[\d.]+)" height="(-?[\d.]+)"/g,
      )) {
        const [x, y, w, h] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
        grow(x, y);
        grow(x + w, y + h);
      }
      for (const m of svg.matchAll(/<path d="([^"]+)"/g)) {
        const nums = (m[1].match(/-?[\d.]+/g) ?? []).map(Number);
        for (let i = 0; i + 1 < nums.length; i += 2) grow(nums[i], nums[i + 1]);
      }
      return { minX, maxX, minY, maxY };
    }

    const violations: string[] = [];
    for (const [id, svg] of Object.entries(figureLibrary)) {
      const { minX, maxX, minY, maxY } = boundsOf(svg);
      if (minX < 0) violations.push(`${id}: off the left edge (minX=${minX.toFixed(1)})`);
      if (maxX > CANVAS_W) violations.push(`${id}: off the right edge (maxX=${maxX.toFixed(1)})`);
      if (minY < 0) violations.push(`${id}: off the top edge (minY=${minY.toFixed(1)})`);
      if (maxY > CANVAS_H) violations.push(`${id}: off the bottom edge (maxY=${maxY.toFixed(1)})`);
    }
    expect(violations).toEqual([]);
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
    const newIds = ['wu-scap-push-up', 'wu-band-external-rotation', 'wu-thread-the-needle', 'wu-band-row'];
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
    const newIds = ['wu-scap-push-up', 'wu-band-external-rotation', 'wu-thread-the-needle', 'wu-band-row'];
    const survivesBoth = newIds.filter((id) => {
      const ex = exerciseLibrary.exercises.find((e) => e.id === id);
      return !!ex && !ex.contraindications.includes('shoulder_horizontal');
    });
    expect(survivesBoth.length).toBeGreaterThanOrEqual(1);
  });
});
