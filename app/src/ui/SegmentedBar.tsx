/**
 * Session progress: one segment per exercise, each filled 0..1 by that exercise's completed sets.
 * `activeIndex` marks the current exercise with a glow in `color` (the current section color).
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { makeStyles, radius, useTheme } from '../theme';
import { clamp01 } from './ProgressRing';

export interface SegmentedBarProps {
  /** Fill 0..1 per segment. */
  values: readonly number[];
  activeIndex?: number;
  /** Default: the theme's `pine`. */
  color?: string;
  height?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SegmentedBar({
  values,
  activeIndex,
  color: colorProp,
  height = 6,
  gap = 4,
  style,
  testID = 'segmented-bar',
}: SegmentedBarProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  const color = colorProp ?? theme.colors.pine;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: values.length,
        now: values.filter((v) => clamp01(v) >= 1).length,
      }}
      style={[styles.row, { gap }, style]}
    >
      {values.map((raw, i) => {
        const v = clamp01(raw);
        const active = i === activeIndex;
        return (
          <View
            key={i}
            testID={`${testID}-segment-${i}`}
            style={[
              styles.track,
              { height, borderRadius: height / 2 },
              active && {
                ...theme.glow(color),
                shadowOpacity: 0.6,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 0 },
              },
            ]}
          >
            <View
              testID={`${testID}-fill-${i}`}
              style={{
                width: `${v * 100}%`,
                height,
                borderRadius: height / 2,
                backgroundColor: color,
                opacity: v > 0 && !active ? 0.85 : 1,
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center' },
    track: { flex: 1, backgroundColor: t.colors.surface2, borderRadius: radius.pill },
  }),
);
