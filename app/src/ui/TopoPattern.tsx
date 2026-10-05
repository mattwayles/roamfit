/**
 * Topographic contour lines — the travel-map texture for hero cards. 5-7 nested organic loops
 * around a seeded center, drawn at 6-9% opacity in the theme's `topo.color` (`text` on Golden
 * Hour, sepia on Daybreak, scaled by `topo.strength`). Fully deterministic from `seed`, so a
 * given card (or city) always gets the same map.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { seededRng } from '../lib/seed';
import { useTheme } from '../theme';
import { useLayoutSize } from './useLayoutSize';

const round = (n: number) => Math.round(n * 100) / 100;

/** Closed Catmull-Rom spline through `pts`, as cubic-bezier SVG path data. */
function smoothClosedPath(pts: readonly (readonly [number, number])[]): string {
  const n = pts.length;
  const at = (i: number) => pts[(i + n) % n]!;
  let d = `M${round(at(0)[0])},${round(at(0)[1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${round(c1x)},${round(c1y)} ${round(c2x)},${round(c2y)} ${round(p2[0])},${round(p2[1])}`;
  }
  return `${d}Z`;
}

/** Pure geometry for a seed: `paths` (5-7 loops in a 0..100 box) and the stroke `opacity`. */
export function topoLoops(seed: string): { paths: string[]; opacity: number } {
  const rng = seededRng(`topo:${seed}`);
  const loops = 5 + Math.floor(rng() * 3);
  const cx = 30 + rng() * 40;
  const cy = 30 + rng() * 40;
  const step = 9 + rng() * 5;
  const r0 = 7 + rng() * 6;
  const squashX = 0.85 + rng() * 0.4;
  const squashY = 0.85 + rng() * 0.4;
  const harmonics = [2, 3, 5].map((k) => ({
    k,
    amp: 0.05 + rng() * 0.09,
    phase: rng() * Math.PI * 2,
    drift: (rng() - 0.5) * 0.5,
  }));
  const points = 14;

  const paths: string[] = [];
  for (let i = 0; i < loops; i++) {
    const r = r0 + i * step;
    const pts: [number, number][] = [];
    for (let j = 0; j < points; j++) {
      const theta = (j / points) * Math.PI * 2;
      let wobble = 1;
      for (const h of harmonics) {
        wobble += h.amp * Math.sin(h.k * theta + h.phase + i * h.drift);
      }
      pts.push([
        cx + Math.cos(theta) * r * wobble * squashX,
        cy + Math.sin(theta) * r * wobble * squashY,
      ]);
    }
    paths.push(smoothClosedPath(pts));
  }
  return { paths, opacity: round(0.06 + rng() * 0.03) };
}

export interface TopoPatternProps {
  seed: string;
  /** Multiplier on the seeded stroke opacity (e.g. 0.6 for the disclaimer gate). */
  strength?: number;
  testID?: string;
}

export function TopoPattern({
  seed,
  strength = 1,
  testID = 'topo-pattern',
}: TopoPatternProps): React.JSX.Element {
  const theme = useTheme();
  const { paths, opacity } = topoLoops(seed);
  const { ready, onLayout } = useLayoutSize();
  return (
    <View testID={testID} pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {ready && (
        <Svg
          style={StyleSheet.absoluteFill}
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid slice"
        >
          {paths.map((d, i) => (
            <Path
              key={i}
              testID={`${testID}-loop-${i}`}
              d={d}
              fill="none"
              stroke={theme.topo.color}
              strokeOpacity={opacity * strength * theme.topo.strength}
              strokeWidth={0.45}
            />
          ))}
        </Svg>
      )}
    </View>
  );
}
