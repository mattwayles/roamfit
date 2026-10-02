/**
 * Set progress dots. `filled` of `count` are solid; `current` gets a ring around its dot. A dot
 * that becomes filled while mounted "pops" (0.6 -> 1.12 -> 1) unless Reduce Motion is on.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { motion, useTheme } from '../theme';
import { useReduceMotion } from './useReduceMotion';

export interface PipsProps {
  count: number;
  /** How many dots are solid (the first N), or an explicit per-dot flag list when the done sets
   *  are not contiguous (a skipped set in the middle stays an empty dot). */
  filled: number | readonly boolean[];
  /** Zero-based index of the current set. */
  current?: number;
  /** Default: the theme's `pine`. */
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function Pip({
  filled,
  current,
  color,
  size,
  testID,
}: {
  filled: boolean;
  current: boolean;
  color: string;
  size: number;
  testID: string;
}) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const wasFilled = useRef(filled);

  useEffect(() => {
    if (filled && !wasFilled.current && !reduceMotion) {
      scale.setValue(motion.pop.from);
      Animated.sequence([
        Animated.timing(scale, { toValue: motion.pop.peak, duration: 110, useNativeDriver: true }),
        Animated.spring(scale, {
          toValue: motion.pop.to,
          speed: 20,
          bounciness: 10,
          useNativeDriver: true,
        }),
      ]).start();
    }
    wasFilled.current = filled;
  }, [filled, reduceMotion, scale]);

  const ring = size + 8;
  return (
    <View
      style={{ width: ring, height: ring }}
      testID={testID}
      accessibilityState={{ selected: current }}
    >
      {current ? (
        <View
          testID={`${testID}-ring`}
          style={[
            styles.ring,
            { width: ring, height: ring, borderRadius: ring / 2, borderColor: color },
          ]}
        />
      ) : null}
      <Animated.View
        testID={`${testID}-dot`}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          margin: 4,
          backgroundColor: filled ? color : theme.colors.surface3,
          transform: [{ scale }],
        }}
      />
    </View>
  );
}

export function Pips({
  count,
  filled,
  current,
  color: colorProp,
  size = 12,
  style,
  testID = 'pips',
}: PipsProps): React.JSX.Element {
  const theme = useTheme();
  const color = colorProp ?? theme.colors.pine;
  const isFilled = (i: number) => (typeof filled === 'number' ? i < filled : filled[i] === true);
  const doneCount =
    typeof filled === 'number'
      ? Math.min(filled, count)
      : Array.from({ length: count }, (_, i) => isFilled(i)).filter(Boolean).length;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${doneCount} of ${count} sets done`}
      style={[styles.row, style]}
    >
      {Array.from({ length: count }, (_, i) => (
        <Pip
          key={i}
          testID={`${testID}-${i}`}
          filled={isFilled(i)}
          current={i === current}
          color={color}
          size={size}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  ring: { position: 'absolute', borderWidth: 2 },
});
