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
});
