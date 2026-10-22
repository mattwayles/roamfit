/**
 * Which parts of a front/back body chart an exercise works, as ready-to-draw path layers. The
 * anatomy is the MIT-licensed path data of `react-native-body-highlighter` (only its data - its
 * own renderer draws ~90 paths per body, too heavy for a long list). Here every body part of one
 * shade is merged into a single path, so a chart is three paths per side: the body, the
 * secondary muscles and the primary ones. Pure, and memoised per muscle set.
 */
import type { Exercise } from '@roamfit/data';
import { bodyFront } from 'react-native-body-highlighter/dist/assets/bodyFront';
import { bodyBack } from 'react-native-body-highlighter/dist/assets/bodyBack';
import type { BodyPart as Part, Slug } from 'react-native-body-highlighter';

/**
 * Library muscle token -> chart regions. The chart has no separate lats, side/rear delts,
 * abductors or hip flexors, so each takes its nearest region: lats are the upper back, every delt
 * is the deltoid, abductors (glute medius) the glutes, and the hip flexors the top of the quads
 * (rectus femoris crosses the hip). Every token the library uses must be here (a test checks).
 */
export const MUSCLE_REGIONS: Record<string, readonly Slug[]> = {
  chest: ['chest'],
  front_delts: ['deltoids'],
  side_delts: ['deltoids'],
  rear_delts: ['deltoids'],
  triceps: ['triceps'],
  biceps: ['biceps'],
  forearms: ['forearm'],
  traps: ['trapezius'],
  upper_back: ['upper-back'],
  lats: ['upper-back'],
  lower_back: ['lower-back'],
  abs: ['abs'],
  obliques: ['obliques'],
  hip_flexors: ['quadriceps'],
  quads: ['quadriceps'],
  hamstrings: ['hamstring'],
  glutes: ['gluteal'],
  abductors: ['gluteal'],
  adductors: ['adductors'],
  calves: ['calves'],
};

/** Which figure shows a muscle best. Regions drawn on both figures (delts, triceps, calves,
 *  traps, adductors, forearms) go where that muscle is mostly seen. */
export const MUSCLE_SIDE: Record<string, ChartSide> = {
  chest: 'front',
  front_delts: 'front',
  side_delts: 'front',
  rear_delts: 'back',
  triceps: 'back',
  biceps: 'front',
  forearms: 'front',
  traps: 'back',
  upper_back: 'back',
  lats: 'back',
  lower_back: 'back',
  abs: 'front',
  obliques: 'front',
  hip_flexors: 'front',
  quads: 'front',
  hamstrings: 'back',
  glutes: 'back',
  abductors: 'back',
  adductors: 'front',
  calves: 'back',
};

export type ChartSide = 'front' | 'back';

/** The figure to show for an exercise: the side of its headline (first) primary muscle - the
 *  same muscle the row's subtitle names. Front when there is none. */
export function exerciseChartSide(exercise: Exercise): ChartSide {
  const first = exercise.primary[0];
  return (first && MUSCLE_SIDE[first]) || 'front';
}

export interface BodyLayers {
  body: string;
  secondary: string;
  primary: string;
}

export interface MuscleChart {
  front: BodyLayers;
  back: BodyLayers;
}

function partPaths(p: Part): string[] {
  const d = p.path ?? {};
  return [...(d.common ?? []), ...(d.left ?? []), ...(d.right ?? [])];
}

function regionsOf(tokens: readonly string[]): Set<Slug> {
  return new Set(tokens.flatMap((t) => MUSCLE_REGIONS[t] ?? []));
}

function layer(asset: readonly Part[], primary: Set<Slug>, secondary: Set<Slug>): BodyLayers {
  const out = { body: [] as string[], secondary: [] as string[], primary: [] as string[] };
  for (const part of asset) {
    const slug = part.slug;
    const bucket =
      slug && primary.has(slug)
        ? out.primary
        : slug && secondary.has(slug)
          ? out.secondary
          : out.body;
    bucket.push(...partPaths(part));
  }
  return {
    body: out.body.join(' '),
    secondary: out.secondary.join(' '),
    primary: out.primary.join(' '),
  };
}

const cache = new Map<string, MuscleChart>();

/** The chart for a primary/secondary muscle pair. A muscle in both lists counts as primary. */
export function muscleChart(primary: readonly string[], secondary: readonly string[]): MuscleChart {
  const key = `${[...primary].sort().join(',')}|${[...secondary].sort().join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = regionsOf(primary);
  const s = regionsOf(secondary);
  for (const slug of p) s.delete(slug);
  const chart = {
    front: layer(bodyFront, p, s),
    back: layer(bodyBack, p, s),
  };
  cache.set(key, chart);
  return chart;
}

export function exerciseMuscleChart(exercise: Exercise): MuscleChart {
  return muscleChart(exercise.primary, exercise.secondary);
}
