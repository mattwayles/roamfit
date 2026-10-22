/**
 * A movement pattern as a stick-figure pictogram (`movementGlyphs.ts`): the figure in the given
 * colour, its scenery (ground, band, seat, arrow) lighter and fainter. One small Svg with at most
 * three shapes and memoised, so a long virtualised list of them stays cheap. Decorative unless given
 * a label.
 */
import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import type { Pattern } from '@roamfit/data';
import { useTheme, type ColorName } from '../theme';
import { MOVEMENT_GLYPHS } from './movementGlyphs';

export interface MovementIconProps {
  pattern: Pattern;
  size?: number;
  color?: ColorName;
  testID?: string;
  /** Set when the icon carries meaning on its own; otherwise it is hidden from VoiceOver. */
  accessibilityLabel?: string;
}

export const MovementIcon = React.memo(function MovementIcon({
  pattern,
  size = 24,
  color = 'text',
  testID,
  accessibilityLabel,
}: MovementIconProps): React.JSX.Element {
  const theme = useTheme();
  const glyph = MOVEMENT_GLYPHS[pattern];
  const stroke = theme.colors[color];
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessible={accessibilityLabel != null}
      importantForAccessibility={accessibilityLabel != null ? 'yes' : 'no-hide-descendants'}
      accessibilityElementsHidden={accessibilityLabel == null}
    >
      {glyph.aux ? (
        <Path
          d={glyph.aux}
          fill="none"
          stroke={stroke}
          strokeWidth={1.2}
          strokeOpacity={0.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      <Path
        d={glyph.body}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={glyph.head[0]} cy={glyph.head[1]} r={2.2} fill={stroke} />
    </Svg>
  );
});
