/**
 * The completion screen's living background: soft glow orbs drifting across a saturated base, so
 * the screen reads as a moving gradient rather than a flat fill. Plain `Animated` API — there is
 * no gradient or blur library installed, so each orb is a stack of concentric translucent circles
 * (a stepped radial falloff that reads as a soft glow once it's large and moving), and every
 * motion is a native-driver transform loop.
 *
 * `still` (the iOS Reduce Motion setting, read by the screen) parks the orbs where they are.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';

interface OrbSpec {
  color: string;
  size: number;
  /** Fractions of the window. */
  x: number;
  y: number;
  driftX: number;
  driftY: number;
  period: number;
}

const ORBS: OrbSpec[] = [
  { color: '#ec4899', size: 1.1, x: -0.35, y: -0.1, driftX: 0.35, driftY: 0.18, period: 7000 },
  { color: '#f59e0b', size: 0.95, x: 0.45, y: 0.45, driftX: -0.3, driftY: -0.22, period: 9000 },
  { color: '#06b6d4', size: 0.85, x: -0.2, y: 0.75, driftX: 0.4, driftY: -0.15, period: 11000 },
];

const RINGS = 6;

function Orb({ spec, still }: { spec: OrbSpec; still: boolean }): React.JSX.Element {
  const { width, height } = useWindowDimensions();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, {
          toValue: 1,
          duration: spec.period,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(t, {
          toValue: 0,
          duration: spec.period,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [still, spec.period, t]);

  const size = spec.size * width;
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: spec.x * width,
        top: spec.y * height,
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [
          {
            translateX: t.interpolate({
              inputRange: [0, 1],
              outputRange: [0, spec.driftX * width],
            }),
          },
          {
            translateY: t.interpolate({
              inputRange: [0, 1],
              outputRange: [0, spec.driftY * height],
            }),
          },
          { scale: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.15, 1] }) },
        ],
      }}
    >
      {Array.from({ length: RINGS }, (_, i) => {
        const d = size * (1 - i / (RINGS + 1));
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: d,
              height: d,
              borderRadius: d / 2,
              backgroundColor: spec.color,
              opacity: 0.09,
            }}
          />
        );
      })}
    </Animated.View>
  );
}

export default function CelebrationBackdrop({ still }: { still: boolean }): React.JSX.Element {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip]}>
      {ORBS.map((spec, i) => (
        <Orb key={i} spec={spec} still={still} />
      ))}
    </View>
  );
}

/**
 * Slowly rotating light rays fanning out from behind the headline — the classic "you won" burst.
 * Each ray is a zero-size View with a coloured top border and transparent side borders (a CSS
 * triangle), apex at the centre, inside a full-size wrapper rotated to its angle.
 */
export function Sunburst({
  size,
  visible,
  still,
}: {
  size: number;
  visible: Animated.Value;
  still: boolean;
}): React.JSX.Element {
  const spin = useRef(new Animated.Value(0)).current;
  const RAYS = 14;

  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 24000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [still, spin]);

  const half = size / 2;
  const rayHalfWidth = Math.tan(Math.PI / (RAYS * 2)) * half;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        left: '50%',
        top: '50%',
        marginLeft: -half,
        marginTop: -half,
        opacity: visible,
        transform: [
          { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
          { scale: visible.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
        ],
      }}
    >
      {Array.from({ length: RAYS }, (_, i) => (
        <View
          key={i}
          style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${(360 / RAYS) * i}deg` }] }]}
        >
          <View
            style={{
              position: 'absolute',
              left: half - rayHalfWidth,
              top: 0,
              width: 0,
              height: 0,
              borderLeftWidth: rayHalfWidth,
              borderRightWidth: rayHalfWidth,
              borderTopWidth: half,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderTopColor: i % 2 === 0 ? 'rgba(255,255,255,0.13)' : 'rgba(253,224,71,0.10)',
            }}
          />
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
