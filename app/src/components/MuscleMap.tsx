/**
 * A front and back body chart with the muscles an exercise works filled in: primary muscles in
 * the given accent, secondary ones in the same accent faded, the rest of the body a quiet neutral.
 * One Svg, six merged paths (`lib/muscleMap.ts`), memoised - cheap enough for every Field Guide
 * row. Decorative unless given a label (the row already names the muscles).
 */
import React from 'react';
import Svg, { G, Path } from 'react-native-svg';
import type { Exercise } from '@roamfit/data';
import { useTheme, type AccentName, type ColorName } from '../theme';
import { exerciseMuscleChart, type BodyLayers } from '../lib/muscleMap';

/** Horizontal crop of each 724-wide side (the figure sits in its middle) and the gap between the
 *  two figures, in asset units. The back side is slid left so the pair sits close. */
const CROP_X = 140;
const CROP_W = 444;
const GAP = 60;
const BACK_SHIFT = 724 - CROP_W - GAP;
const VIEWBOX = `${CROP_X} 0 ${CROP_W * 2 + GAP} 1448`;

/** Width / height of the drawn pair. */
export const MUSCLE_MAP_ASPECT = (CROP_W * 2 + GAP) / 1448;

export interface MuscleMapProps {
  exercise: Exercise;
  /** Height in points; the width follows `MUSCLE_MAP_ASPECT`. */
  height: number;
  accent: AccentName;
  /** The body's neutral; defaults to the strong line colour. */
  bodyColor?: ColorName;
  testID?: string;
  accessibilityLabel?: string;
}

function Side({
  layers,
  body,
  accent,
}: {
  layers: BodyLayers;
  body: string;
  accent: string;
}): React.JSX.Element {
  return (
    <>
      <Path d={layers.body} fill={body} />
      {layers.secondary ? <Path d={layers.secondary} fill={accent} fillOpacity={0.4} /> : null}
      {layers.primary ? <Path d={layers.primary} fill={accent} /> : null}
    </>
  );
}

export const MuscleMap = React.memo(function MuscleMap({
  exercise,
  height,
  accent,
  bodyColor = 'lineStrong',
  testID,
  accessibilityLabel,
}: MuscleMapProps): React.JSX.Element {
  const theme = useTheme();
  const chart = exerciseMuscleChart(exercise);
  const fill = theme.colors[accent];
  const body = theme.colors[bodyColor];
  return (
    <Svg
      width={Math.round(height * MUSCLE_MAP_ASPECT)}
      height={height}
      viewBox={VIEWBOX}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessible={accessibilityLabel != null}
      importantForAccessibility={accessibilityLabel != null ? 'yes' : 'no-hide-descendants'}
      accessibilityElementsHidden={accessibilityLabel == null}
    >
      <Side layers={chart.front} body={body} accent={fill} />
      <G transform={`translate(${-BACK_SHIFT} 0)`}>
        <Side layers={chart.back} body={body} accent={fill} />
      </G>
    </Svg>
  );
});
