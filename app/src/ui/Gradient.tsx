/**
 * Absolute-fill linear gradient drawn with react-native-svg. `angle` follows CSS (0 = to top,
 * 90 = to right, 180 = to bottom, 135 = to bottom-right — the trail default). `radius` clips the
 * fill to the parent's corners; the clip lives on this wrapper so a parent can keep its own glow
 * (a shadow is clipped by `overflow: hidden`, so parents must not set it).
 */
import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme';
import { useLayoutSize } from './useLayoutSize';

export interface GradientProps {
  /** Default: the theme's `trail`. */
  colors?: readonly string[];
  angle?: number;
  radius?: number;
  testID?: string;
}

/** Unit-box (objectBoundingBox) gradient vector for a CSS angle. */
export function gradientPoints(angle: number) {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad) / 2;
  const dy = -Math.cos(rad) / 2;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { x1: r(0.5 - dx), y1: r(0.5 - dy), x2: r(0.5 + dx), y2: r(0.5 + dy) };
}

export function Gradient({
  colors: colorsProp,
  angle = 135,
  radius = 0,
  testID = 'gradient',
}: GradientProps): React.JSX.Element {
  const theme = useTheme();
  const colors = colorsProp ?? theme.gradients.trail;
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const { ready, onLayout } = useLayoutSize();
  const { x1, y1, x2, y2 } = gradientPoints(angle);
  const last = Math.max(colors.length - 1, 1);
  return (
    <View
      testID={testID}
      pointerEvents="none"
      onLayout={onLayout}
      style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}
    >
      {ready && (
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
              {colors.map((c, i) => (
                <Stop key={i} offset={i / last} stopColor={c} />
              ))}
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
      )}
    </View>
  );
}
