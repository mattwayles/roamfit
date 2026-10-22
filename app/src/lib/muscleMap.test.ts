import { exerciseLibrary } from '@roamfit/data';
import {
  MUSCLE_REGIONS,
  MUSCLE_SIDE,
  exerciseChartSide,
  exerciseMuscleChart,
  muscleChart,
  pickerRegions,
  pickerShapes,
} from './muscleMap';

describe('muscleMap', () => {
  it('maps every muscle the library uses to a chart region', () => {
    const used = new Set(exerciseLibrary.exercises.flatMap((e) => [...e.primary, ...e.secondary]));
    for (const token of used) expect(MUSCLE_REGIONS[token]?.length ?? 0).toBeGreaterThan(0);
  });

  it('assigns every muscle the library uses a side', () => {
    const used = new Set(exerciseLibrary.exercises.flatMap((e) => [...e.primary, ...e.secondary]));
    for (const token of used) expect(MUSCLE_SIDE[token]).toBeDefined();
  });

  it('shows every exercise on a side where its headline muscle is highlighted', () => {
    for (const e of exerciseLibrary.exercises) {
      const side = exerciseChartSide(e);
      expect(exerciseMuscleChart(e)[side].primary).not.toBe('');
    }
  });

  it('picks the side from the first primary muscle', () => {
    const base = exerciseLibrary.exercises[0]!;
    expect(exerciseChartSide({ ...base, primary: ['quads', 'glutes'] })).toBe('front');
    expect(exerciseChartSide({ ...base, primary: ['glutes', 'quads'] })).toBe('back');
    expect(exerciseChartSide({ ...base, primary: ['rear_delts'] })).toBe('back');
    expect(exerciseChartSide({ ...base, primary: [] })).toBe('front');
  });

  it('puts chest on the front and glutes on the back', () => {
    const chest = muscleChart(['chest'], []);
    expect(chest.front.primary).not.toBe('');
    expect(chest.back.primary).toBe('');
    const glutes = muscleChart(['glutes'], []);
    expect(glutes.front.primary).toBe('');
    expect(glutes.back.primary).not.toBe('');
  });

  it('draws a region once: primary wins over secondary, the rest is body', () => {
    const both = muscleChart(['quads'], ['quads', 'abs']);
    expect(both.front.secondary).not.toBe('');
    const quadsOnly = muscleChart(['quads'], []);
    // Abs moved from body to secondary; quads stayed primary.
    expect(both.front.primary).toBe(quadsOnly.front.primary);
    expect(both.front.body.length).toBeLessThan(quadsOnly.front.body.length);
  });

  it('memoises per muscle set regardless of order', () => {
    expect(muscleChart(['chest', 'triceps'], ['abs'])).toBe(
      muscleChart(['triceps', 'chest'], ['abs']),
    );
  });
});

describe('picker regions', () => {
  const available = [
    ...new Set(exerciseLibrary.exercises.flatMap((e) => [...e.primary, ...e.secondary])),
  ];

  it('makes every library muscle tappable on exactly one figure, in one or more regions', () => {
    for (const token of available) {
      const sides = (['front', 'back'] as const).filter((side) =>
        pickerRegions(side, available).some((r) => r.tokens.includes(token)),
      );
      expect(sides).toEqual([MUSCLE_SIDE[token]]);
    }
  });

  it('groups muscles that share a region and splits delts by side', () => {
    const tokens = (side: 'front' | 'back', slug: string) =>
      pickerRegions(side, available).find((r) => r.slug === slug)?.tokens;
    expect(tokens('back', 'upper-back')).toEqual(expect.arrayContaining(['upper_back', 'lats']));
    expect(tokens('back', 'gluteal')).toEqual(expect.arrayContaining(['glutes', 'abductors']));
    expect(tokens('front', 'deltoids')).toEqual(['front_delts', 'side_delts']);
    expect(tokens('back', 'deltoids')).toEqual(['rear_delts']);
    expect(tokens('front', 'head')).toBeUndefined();
  });

  it('draws tappable regions separately from the body', () => {
    const shapes = pickerShapes('front', ['chest']);
    expect(shapes.regions.get('chest')).toBeTruthy();
    expect(shapes.body).not.toBe('');
    expect(pickerShapes('front', ['chest'])).toBe(shapes);
  });
});
