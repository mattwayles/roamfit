/**
 * Track 44c - the large emblem in the badge sheet. For an earned gold or summit badge, dragging
 * on the emblem tilts it a few degrees (perspective rotateX/rotateY, clamped) and slides a soft
 * diagonal highlight across it; letting go springs it back. Every other badge, and everyone with
 * Reduce Motion on, gets the plain emblem.
 *
 * The responder only claims a touch that starts on the emblem itself, so the sheet's own swipe
 * to dismiss still works from anywhere else.
 */
import React, { useMemo, useRef } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import { useReduceMotion } from '../ui';
import type { ShelfBadge } from '../lib/badges';
import { BadgeEmblem } from './BadgeEmblem';

/** Drag distance (px) for a full tilt. */
const REACH = 60;
const MAX_TILT_DEG = 12;

export function tiltEnabled(badge: ShelfBadge): boolean {
  return badge.earned && (badge.def.tier === 'gold' || badge.def.tier === 'summit');
}

/** Clamp a drag offset to -1..1 of a full tilt. */
export function tiltFraction(delta: number): number {
  return Math.max(-1, Math.min(1, delta / REACH));
}

export function TiltSheen({ badge, size }: { badge: ShelfBadge; size: number }): React.JSX.Element {
  const still = useReduceMotion();
  const enabled = tiltEnabled(badge) && !still;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  // The highlight moves an SVG prop, which only the JS driver can do; the tilt stays native.
  const sheen = useRef(new Animated.Value(0)).current;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          sheen.stopAnimation();
          tx.stopAnimation();
          ty.stopAnimation();
        },
        onPanResponderMove: (_e, g) => {
          const fx = tiltFraction(g.dx);
          tx.setValue(fx);
          ty.setValue(tiltFraction(g.dy));
          sheen.setValue((fx + 1) / 2);
        },
        onPanResponderRelease: () => release(),
        onPanResponderTerminate: () => release(),
      }),
    [],
  );

  function release(): void {
    Animated.spring(tx, { toValue: 0, friction: 5, tension: 80, useNativeDriver: true }).start();
    Animated.spring(ty, { toValue: 0, friction: 5, tension: 80, useNativeDriver: true }).start();
    Animated.timing(sheen, { toValue: 1, duration: 260, useNativeDriver: false }).start(() =>
      sheen.setValue(0),
    );
  }

  if (!enabled) return <BadgeEmblem badge={badge} size={size} showProgress />;

  const deg = (v: Animated.Value, sign: 1 | -1) =>
    v.interpolate({
      inputRange: [-1, 1],
      outputRange: [`${-MAX_TILT_DEG * sign}deg`, `${MAX_TILT_DEG * sign}deg`],
    });

  return (
    <View testID="badge-sheet-tilt" {...pan.panHandlers}>
      <Animated.View
        style={{
          transform: [{ perspective: 500 }, { rotateX: deg(ty, -1) }, { rotateY: deg(tx, 1) }],
        }}
      >
        <BadgeEmblem badge={badge} size={size} showProgress sheen={sheen} />
      </Animated.View>
    </View>
  );
}
