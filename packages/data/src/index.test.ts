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

  it('never draws a hand/foot marker below the ground line, across every figure', () => {
    // Round-3 regression guard, replacing a round-2 test that checked only 5 hand-picked plank
    // ids and used a *symmetric* 15px tolerance ("within 15px of the ground line" either side).
    // That tolerance was wide enough to pass on art that was actually broken: bw-plank's foot
    // sat at y=165.0 against a y=152 ground line — 13.0px THROUGH the floor — and the test still
    // passed because 13.0 < 15. The round-2 status file also claimed every case was grounded
    // "within ~5px," which this round's direct measurement of the committed SVGs (not a rerun of
    // the same assumption) showed was false for bw-plank and 19 other figures (10.7-13.0px
    // through the floor: the whole squat and plank/burpee/bear-crawl families).
    //
    // Feet do not sink into the floor, so the correct tolerance is asymmetric: floating a few px
    // above the ground line is a fine simplification of this rig, landing below it never is. This
    // check covers every one of the 200 bundled figures (not a hand-picked list), because the
    // underlying bug classes (squat depth, plank/burpee end pose, lunge, jump-squat) span most of
    // the standing/plank pattern families, not just the plank hold the orchestrator happened to
    // spot. GROUND=152 matches the constant the generator draws groundLine() at
    // (tools/generate-figures.ts); the marker circle radius is 2.8 (rigSvg's hand/foot dots).
    const GROUND = 152;
    const BELOW_GROUND_TOLERANCE = 1; // float-rounding slop only — never a real sink-through-floor amount
    let checkedAtLeastOneMarker = false;
    const violations: string[] = [];
    for (const [id, svg] of Object.entries(figureLibrary)) {
      const markerYs = [...svg.matchAll(/<circle cx="[\d.]+" cy="([\d.]+)" r="2\.8"/g)].map((m) =>
        Number(m[1]),
      );
      for (const y of markerYs) {
        checkedAtLeastOneMarker = true;
        if (y >= GROUND + BELOW_GROUND_TOLERANCE) {
          violations.push(
            `${id}: marker at y=${y} (${(y - GROUND).toFixed(1)}px through the floor)`,
          );
        }
      }
    }
    expect(checkedAtLeastOneMarker).toBe(true);
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
