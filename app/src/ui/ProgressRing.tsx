/**
 * SVG progress ring: `progress` 0..1 over a `surface2` track, stroked with a gradient, children
 * centered inside. Progress changes animate (dropped under Reduce Motion or `animate={false}`).
 */
import React, { useEffect, useId, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, gradients } from '../theme';
import { useReduceMotion } from './useReduceMotion';

const ACircle = Animated.createAnimatedComponent(Circle);

export interface ProgressRingProps {
  /** 0..1; clamped, NaN -> 0. */
  progress: number;
  size?: number;
  stroke?: number;
  gradient?: readonly string[];
  trackColor?: string;
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  children?: React.ReactNode;
}

export const clamp01 = (n: number): number =>
  Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;

export function ProgressRing({
  progress,
  size = 64,
  stroke = 8,
  gradient = gradients.summit,
  trackColor = colors.surface2,
  animate = true,
  style,
  testID = 'progress-ring',
  accessibilityLabel,
  children,
}: ProgressRingProps): React.JSX.Element {
  const id = `r${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const reduceMotion = useReduceMotion();
  const p = clamp01(progress);
  const value = useRef(new Animated.Value(p)).current;

  useEffect(() => {
    if (!animate || reduceMotion) {
      value.setValue(p);
      return;
    }
    const anim = Animated.timing(value, {
      toValue: p,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [p, animate, reduceMotion, value]);

  const c = size / 2;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = value.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] });
  const last = Math.max(gradient.length - 1, 1);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p * 100) }}
      style={[{ width: size, height: size }, style]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            {gradient.map((g, i) => (
              <Stop key={i} offset={i / last} stopColor={g} />
            ))}
          </LinearGradient>
        </Defs>
        <Circle cx={c} cy={c} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <ACircle
          testID={`${testID}-arc`}
          cx={c}
          cy={c}
          r={r}
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          rotation={-90}
          origin={`${c}, ${c}`}
        />
      </Svg>
      {children ? <View style={styles.center}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});
