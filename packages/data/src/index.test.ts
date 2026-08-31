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
    // Regression guard for the orchestrator's Finding 1 (200 exercises collapsed into 57
    // distinct geometries after stripping <title>). Threshold set below the current count
    // (130/200, see STATUS-6a-figures.md) so it fails loudly if a future edit collapses variety
    // back down, without pinning the exact number.
    const distinctGeometries = new Set(
      Object.values(figureLibrary).map((svg) => svg.replace(/<title>.*?<\/title>/, '')),
    );
    expect(distinctGeometries.size).toBeGreaterThanOrEqual(110);
  });

  it('draws an isometric hold (metric === "time") as a single pose with a hold glyph, not a '
    + 'two-pose overlay with a movement arrow', () => {
    // Regression guard for Finding 4. A hold figure has no panel divider and no red movement
    // arrow; a dynamic (reps/amrap) figure has both.
    const holdIds = exerciseLibrary.exercises.filter((e) => e.metric === 'time').map((e) => e.id);
    expect(holdIds.length).toBeGreaterThan(0);
    for (const id of holdIds) {
      const svg = figureLibrary[id];
      expect(svg).not.toContain('stroke="#e2e8f0" stroke-width="2"'); // the panel divider
      expect(svg).not.toContain('fill="#b91c1c"'); // the movement-arrow head
    }
  });

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
});
