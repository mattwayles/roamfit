/**
 * Track 44c - the motion behind BadgeEmblem. Everything here is optional polish: callers pass a
 * Reduce Motion flag (or never mount these hooks), and the emblem's static render is the end
 * state of every animation, so nothing is lost with motion off.
 *
 *  - `useStitchIn`: a first-view reveal. The outline pops in (native-driven scale + opacity) and
 *    the glyph fades in a beat later, as if the patch were just sewn on.
 *  - `useSharedShimmer`: ONE looping value for every earned summit emblem on the page. It drives
 *    an SVG prop, so it runs on the JS driver; sharing it keeps that to a single timer however
 *    many emblems are shimmering.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

export interface StitchIn {
  /** Outline + whole-emblem pop, 0 -> 1. */
  pop: Animated.Value;
  /** Glyph fade, 0 -> 1, a beat behind the pop. */
  glyph: Animated.Value;
}

/** Plays once each time `play` turns true. `null` when motion is off or not asked for. */
export function useStitchIn(play: boolean, still: boolean): StitchIn | null {
  const active = play && !still;
  const pop = useRef(new Animated.Value(active ? 0 : 1)).current;
  const glyph = useRef(new Animated.Value(active ? 0 : 1)).current;
  const played = useRef(false);

  useEffect(() => {
    if (!active) {
      played.current = false;
      pop.setValue(1);
      glyph.setValue(1);
      return;
    }
    if (played.current) return;
    played.current = true;
    pop.setValue(0);
    glyph.setValue(0);
    const anim = Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 6, tension: 110, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(220),
        Animated.timing(glyph, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [active, pop, glyph]);

  return active ? { pop, glyph } : null;
}

let shimmerValue: Animated.Value | null = null;
let shimmerUsers = 0;
let shimmerLoop: Animated.CompositeAnimation | null = null;

/** A 0 -> 1 value that sweeps slowly (a long rest between sweeps), shared by every caller that
 *  passes `enabled`. Returns null while disabled. */
export function useSharedShimmer(enabled: boolean): Animated.Value | null {
  useEffect(() => {
    if (!enabled) return;
    shimmerValue ??= new Animated.Value(0);
    shimmerUsers += 1;
    if (shimmerUsers === 1) {
      const v = shimmerValue;
      v.setValue(0);
      shimmerLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 1,
            duration: 1800,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.delay(3200),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: false }),
        ]),
      );
      shimmerLoop.start();
    }
    return () => {
      shimmerUsers -= 1;
      if (shimmerUsers === 0) {
        shimmerLoop?.stop();
        shimmerLoop = null;
      }
    };
  }, [enabled]);
  if (!enabled) return null;
  shimmerValue ??= new Animated.Value(0);
  return shimmerValue;
}
