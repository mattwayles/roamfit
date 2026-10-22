/**
 * A single body figure with the muscles an exercise works filled in: primary muscles in the given
 * accent, secondary ones in the same accent faded, the rest of the body a quiet neutral. Front or
 * back, whichever shows the exercise's headline muscle (`exerciseChartSide`). One Svg, three
 * merged paths (`lib/muscleMap.ts`), memoised - cheap enough for every Field Guide row.
 * Decorative unless given a label (the row already names the muscle).
 */
import React from 'react';
import Svg, { Path } from 'react-native-svg';
import type { Exercise } from '@roamfit/data';
import { useTheme, type AccentName, type ColorName } from '../theme';
import { exerciseChartSide, exerciseMuscleChart } from '../lib/muscleMap';

/** The asset draws each side 724 x 1448, the back 724 to the right; the figure sits in the middle
 *  of its side, so crop to it. */
const SIDE_W = 724;
const CROP_X = 140;
const CROP_W = 444;
const HEIGHT = 1448;

/** Width / height of the drawn figure. */
export const MUSCLE_MAP_ASPECT = CROP_W / HEIGHT;

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

export const MuscleMap = React.memo(function MuscleMap({
  exercise,
  height,
  accent,
  bodyColor = 'lineStrong',
  testID,
  accessibilityLabel,
}: MuscleMapProps): React.JSX.Element {
  const theme = useTheme();
  const side = exerciseChartSide(exercise);
  const layers = exerciseMuscleChart(exercise)[side];
  const fill = theme.colors[accent];
  const x = (side === 'back' ? SIDE_W : 0) + CROP_X;
  return (
    <Svg
      width={Math.round(height * MUSCLE_MAP_ASPECT)}
      height={height}
      viewBox={`${x} 0 ${CROP_W} ${HEIGHT}`}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessible={accessibilityLabel != null}
      importantForAccessibility={accessibilityLabel != null ? 'yes' : 'no-hide-descendants'}
      accessibilityElementsHidden={accessibilityLabel == null}
    >
      <Path d={layers.body} fill={theme.colors[bodyColor]} />
      {layers.secondary ? <Path d={layers.secondary} fill={fill} fillOpacity={0.4} /> : null}
      {layers.primary ? <Path d={layers.primary} fill={fill} /> : null}
    </Svg>
  );
});
