/**
 * A new Passport stamp, earned this session — the completion screen's last big beat before
 * "Heck yes!". Same Midnight card as a level-up (`golden` gradient border, gold glow), but the
 * star is a large stamp that arrives the way a real one does:
 *   1. the label ("YOU EARNED A NEW STAMP!") springs in, and the stamp lifts into view huge and
 *      faint, tilted, with a shadow far below it on the page (a light selection tick);
 *   2. it accelerates down (ease-in: it speeds up as it nears the paper) and the shadow tightens;
 *   3. IMPACT, `STAMP_IMPACT_MS` after mount: the stamp squashes into the page, the card dents a
 *      few pixels and springs back, an ink ring shocks outward and fades, and `onImpact` fires so
 *      the screen can shake, burst confetti and play the thunk + haptics;
 *   4. the "Stamp #N" line, any "new country" chip and the tap hint fade up, the glow starts to
 *      breathe.
 * Tapping the stamp lifts it and stamps it again, impact and all. Reduce Motion: the stamp is
 * simply there, with the impact cue and no motion. Plain `Animated` API, all native-driven.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import type { NewStamp } from '../lib/newStamp';
import { hapticStampLift } from '../lib/workoutAudio';
import { makeStyles, radius, space, useTheme, withAlpha } from '../theme';
import { Card, Chip, IconButton, Stamp, stampSpec, Txt } from '../ui';

interface Props {
  stamp: NewStamp;
  /** Reduce Motion: no flight, no ring, no looping glow. */
  still: boolean;
  /** Fired at the moment of contact — the first stamping and every re-stamp. */
  onImpact: () => void;
  onShare: () => void;
  testID: string;
}

export const STAMP_SIZE = 168;
/** Mount → the stamp starts to descend (the label gets the first beat to itself). */
const LIFT_DELAY_MS = 380;
const DESCENT_MS = 420;
const RESTAMP_DESCENT_MS = 240;
/** Mount → contact. The screen holds "Heck yes!" until this plus `STAMP_SETTLE_MS`. */
export const STAMP_IMPACT_MS = LIFT_DELAY_MS + DESCENT_MS;

export default function NewStampCard({
  stamp,
  still,
  onImpact,
  onShare,
  testID,
}: Props): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  const spec = stampSpec(stamp.label);
  const ink = theme.colors[spec.tone];
  const wide = spec.shape === 'rect';
  const w = wide ? Math.round(STAMP_SIZE * 1.25) : STAMP_SIZE;
  const h = wide ? Math.round(STAMP_SIZE * 0.86) : STAMP_SIZE;

  const label = useRef(new Animated.Value(0)).current;
  const drop = useRef(new Animated.Value(0)).current; // 0 = hovering high, 1 = on the page
  const squash = useRef(new Animated.Value(0)).current; // 1 = pressed into the page
  const ring = useRef(new Animated.Value(0)).current;
  const after = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onImpactRef = useRef(onImpact);
  onImpactRef.current = onImpact;
  const stampedOnce = useRef(false);

  const impact = useCallback(() => {
    onImpactRef.current();
    if (still) {
      drop.setValue(1);
      after.setValue(1);
      return;
    }
    squash.setValue(1);
    Animated.spring(squash, {
      toValue: 0,
      friction: 4,
      tension: 200,
      useNativeDriver: true,
    }).start();
    ring.setValue(0);
    Animated.timing(ring, {
      toValue: 1,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    Animated.timing(after, {
      toValue: 1,
      duration: 400,
      delay: 200,
      useNativeDriver: true,
    }).start();
  }, [still, drop, squash, ring, after]);

  const slam = useCallback(
    (delay: number, descent: number) => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
      if (still) {
        at(delay, impact);
        return;
      }
      drop.setValue(0);
      at(delay, () => {
        hapticStampLift();
        Animated.timing(drop, {
          toValue: 1,
          duration: descent,
          // Ease-in: it picks up speed toward the paper, so contact is the fastest moment.
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
      at(delay + descent, impact);
    },
    [still, drop, impact],
  );

  useEffect(() => {
    Animated.spring(label, {
      toValue: 1,
      friction: 5,
      tension: 120,
      useNativeDriver: true,
    }).start();
    slam(still ? 150 : LIFT_DELAY_MS, DESCENT_MS);
    stampedOnce.current = true;
    if (!still) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0, duration: 800, useNativeDriver: true }),
        ]),
      );
      pulse.start();
      return () => {
        pulse.stop();
        timers.current.forEach(clearTimeout);
      };
    }
    return () => timers.current.forEach(clearTimeout);
    // Mount-only: the card is mounted exactly when the stamp is earned.
  }, []);

  const placeLine = `Stamp #${stamp.placeCount} · ${stamp.countryCount} ${
    stamp.countryCount === 1 ? 'country' : 'countries'
  }`;

  return (
    <View testID={testID} style={styles.wrap}>
      <Animated.View
        style={{
          opacity: label,
          transform: [
            { scale: label.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
            { translateY: label.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
          ],
        }}
      >
        <Txt
          testID={`${testID}-label`}
          variant="h2"
          color="gold"
          align="center"
          style={styles.heading}
        >
          YOU EARNED A NEW STAMP!
        </Txt>
      </Animated.View>

      <View style={styles.cardWrap}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              opacity: Animated.multiply(
                after,
                glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.65] }),
              ),
            },
          ]}
        />
        <Animated.View
          style={{
            transform: [
              {
                translateY: squash.interpolate({ inputRange: [0, 1], outputRange: [0, 5] }),
              },
            ],
          }}
        >
          <Card variant="accent" gradient={theme.gradients.golden} padding="md">
            <View style={styles.shareRow}>
              <IconButton
                testID={`${testID}-share`}
                icon="share"
                size="md"
                accessibilityLabel="Share"
                onPress={onShare}
              />
            </View>
            <View style={styles.page}>
              {/* The ink ring and the shadow are siblings of the stamp inside a fixed box, so the
                  flight never moves the layout around it. */}
              <View style={[styles.stage, { width: w + 56, height: h + 56 }]}>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.ring,
                    {
                      width: w,
                      height: h,
                      borderRadius: wide ? radius.sm : w / 2,
                      borderColor: ink,
                      opacity: ring.interpolate({
                        inputRange: [0, 0.15, 1],
                        outputRange: [0, 0.7, 0],
                      }),
                      transform: [
                        { scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) },
                      ],
                    },
                  ]}
                />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.shadow,
                    {
                      width: w,
                      height: h,
                      borderRadius: wide ? radius.sm : w / 2,
                      opacity: drop.interpolate({
                        inputRange: [0, 0.6, 1],
                        outputRange: [0.15, 0.35, 0],
                      }),
                      transform: [
                        {
                          translateY: drop.interpolate({
                            inputRange: [0, 1],
                            outputRange: [46, 0],
                          }),
                        },
                        { scale: drop.interpolate({ inputRange: [0, 1], outputRange: [1.5, 1] }) },
                      ],
                    },
                  ]}
                />
                <Pressable
                  testID={`${testID}-press`}
                  onPress={() => slam(0, RESTAMP_DESCENT_MS)}
                  accessibilityRole="button"
                  accessibilityLabel={`New passport stamp: ${stamp.label}`}
                  accessibilityHint="Stamps it again"
                >
                  <Animated.View
                    style={{
                      opacity: drop.interpolate({
                        inputRange: [0, 0.25, 1],
                        outputRange: [0, 1, 1],
                        extrapolate: 'clamp',
                      }),
                      transform: [
                        {
                          scale: Animated.multiply(
                            drop.interpolate({ inputRange: [0, 1], outputRange: [2.6, 1] }),
                            squash.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }),
                          ),
                        },
                        {
                          rotate: drop.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['-14deg', '0deg'],
                          }),
                        },
                      ],
                    }}
                  >
                    <Stamp
                      testID={`${testID}-stamp`}
                      title={stamp.label}
                      subtitle={stamp.dateLabel}
                      seed={stamp.label}
                      size={STAMP_SIZE}
                    />
                  </Animated.View>
                </Pressable>
              </View>
            </View>

            <Animated.View style={[styles.after, { opacity: after }]}>
              <Txt variant="eyebrow" color="text2" align="center">
                {placeLine}
              </Txt>
              {stamp.newCountry && (
                <Chip
                  testID={`${testID}-new-country`}
                  tone="gold"
                  icon="star"
                  label="New country!"
                />
              )}
              <Txt variant="small" color="text3" align="center">
                Tap the stamp to stamp it again
              </Txt>
            </Animated.View>
          </Card>
        </Animated.View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    wrap: { width: '100%', gap: space.md },
    heading: { letterSpacing: 1.5 },
    cardWrap: { width: '100%' },
    halo: {
      position: 'absolute',
      top: -6,
      left: -6,
      right: -6,
      bottom: -6,
      borderRadius: radius.lg + 6,
      // Decoration, no text on it: the vivid gold in both modes (DESIGN.md §8.1).
      backgroundColor: t.vivid.gold,
      ...t.glow(t.vivid.gold),
    },
    // Floats over the page's top-right corner without pushing the stamp down.
    shareRow: { position: 'absolute', top: space.sm, right: space.sm, zIndex: 2 },
    page: { alignItems: 'center', paddingVertical: space.sm },
    stage: { alignItems: 'center', justifyContent: 'center' },
    ring: { position: 'absolute', borderWidth: 3 },
    shadow: { position: 'absolute', backgroundColor: withAlpha('#000000', 0.5) },
    after: { alignItems: 'center', gap: space.xs, marginTop: space.xs },
  }),
);
