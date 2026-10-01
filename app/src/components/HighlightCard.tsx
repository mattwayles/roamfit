/**
 * One level-up (or Mastery best set) on the completion screen — what used to be its own
 * step-through full-screen interrupt, now the completion screen's crescendo (DESIGN.md §5.9).
 * Laid out from the start (so revealing it never shifts the page), invisible and untappable until
 * `revealed`, then: the card stamps down with an overshooting spring, a `Stamp` ("LEVEL UP" in
 * ember, "BEST SET" in gold) slams onto its left a beat later, a pulsing gold glow sits behind it,
 * a shine sweeps across it on a loop, and — for a level-up — the "Level N of M" bar fills from the
 * old rung to the new one in the `sunrise` gradient. The card is `surface` inside a 2px `golden`
 * gradient border; share is an `IconButton`. Plain `Animated` API throughout, and no violet.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import type { HighlightCelebration } from '../lib/celebration';
import { makeStyles, radius, space, useTheme, withAlpha } from '../theme';
import { Card, Gradient, IconButton, Stamp, Txt } from '../ui';

interface Props {
  highlight: HighlightCelebration;
  revealed: boolean;
  /** Reduce Motion: keep the stamp-in, drop the looping glow/shine. */
  still: boolean;
  onShare: () => void;
  testID: string;
}

const STAMP_SIZE = 84;

export default function HighlightCard({
  highlight,
  revealed,
  still,
  onShare,
  testID,
}: Props): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  const stamp = useRef(new Animated.Value(0)).current;
  const badge = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0)).current;
  const shine = useRef(new Animated.Value(0)).current;
  // Layout width can't run on the native driver.
  const fill = useRef(new Animated.Value(0)).current;

  const isLevelUp = highlight.kind === 'level_up';
  const fromFraction = isLevelUp ? (highlight.levelN - 1) / highlight.levelOf : 0;
  const toFraction = isLevelUp ? highlight.levelN / highlight.levelOf : 1;

  useEffect(() => {
    if (!revealed) return;
    fill.setValue(fromFraction);
    const anims: { stop: () => void }[] = [];
    const stampIn = Animated.spring(stamp, {
      toValue: 1,
      friction: 4,
      tension: 90,
      useNativeDriver: true,
    });
    stampIn.start();
    anims.push(stampIn);

    // The passport stamp lands a beat after the card, so there are two slams, not one.
    const badgeIn = Animated.sequence([
      Animated.delay(220),
      Animated.spring(badge, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }),
    ]);
    badgeIn.start();
    anims.push(badgeIn);

    const fillUp = Animated.sequence([
      Animated.delay(350),
      Animated.timing(fill, {
        toValue: toFraction,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]);
    fillUp.start();
    anims.push(fillUp);

    if (!still) {
      const glowLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(glowPulse, { toValue: 0, duration: 700, useNativeDriver: true }),
        ]),
      );
      glowLoop.start();
      anims.push(glowLoop);
      const shineLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(shine, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay(1400),
          Animated.timing(shine, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );
      shineLoop.start();
      anims.push(shineLoop);
    }
    return () => anims.forEach((a) => a.stop());
  }, [revealed, still, stamp, badge, glowPulse, shine, fill, fromFraction, toFraction]);

  return (
    <View testID={testID} pointerEvents={revealed ? 'auto' : 'none'} style={styles.wrap}>
      <Animated.View
        style={[
          styles.halo,
          {
            opacity: Animated.multiply(
              stamp.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
              glowPulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.7] }),
            ),
            transform: [
              { scale: glowPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) },
            ],
          },
        ]}
      />
      <Animated.View
        style={{
          opacity: stamp.interpolate({
            inputRange: [0, 0.2, 1],
            outputRange: [0, 1, 1],
            extrapolate: 'clamp',
          }),
          transform: [
            { scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) },
            { rotate: stamp.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '0deg'] }) },
          ],
        }}
      >
        <Card variant="accent" gradient={theme.gradients.golden} padding="md" style={styles.card}>
          <View pointerEvents="none" style={styles.shineClip}>
            <Animated.View
              style={[
                styles.shine,
                {
                  transform: [
                    {
                      translateX: shine.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-160, 520],
                      }),
                    },
                    { rotate: '20deg' },
                  ],
                },
              ]}
            />
          </View>

          <View style={styles.row}>
            <Animated.View
              style={{
                opacity: badge.interpolate({
                  inputRange: [0, 0.2, 1],
                  outputRange: [0, 1, 1],
                  extrapolate: 'clamp',
                }),
                transform: [
                  { scale: badge.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] }) },
                ],
              }}
            >
              <Stamp
                testID={`${testID}-stamp`}
                title={isLevelUp ? 'LEVEL UP' : 'BEST SET'}
                seed={`${highlight.kind}:${highlight.familyName}`}
                tone={isLevelUp ? 'ember' : 'gold'}
                size={STAMP_SIZE}
              />
            </Animated.View>

            <View style={styles.body}>
              <View style={styles.headRow}>
                <Txt variant="eyebrow" color="gold" numberOfLines={1} style={styles.family}>
                  {highlight.familyName}
                </Txt>
                <IconButton
                  testID={`${testID}-share`}
                  icon="share"
                  size="md"
                  accessibilityLabel="Share"
                  onPress={onShare}
                />
              </View>

              {highlight.kind === 'level_up' ? (
                <>
                  <Txt variant="h2" numberOfLines={2}>
                    {highlight.newExerciseName}
                  </Txt>
                  {highlight.fromExerciseName && (
                    <Txt variant="small" color="text3" numberOfLines={1} style={styles.from}>
                      {highlight.fromExerciseName}
                    </Txt>
                  )}
                  <View style={styles.barTrack}>
                    <Animated.View
                      style={[
                        styles.barFill,
                        {
                          width: fill.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%'],
                          }),
                        },
                      ]}
                    >
                      <Gradient radius={radius.pill} />
                    </Animated.View>
                  </View>
                  <Txt variant="eyebrow" color="text2">
                    Level {highlight.levelN} of {highlight.levelOf}
                  </Txt>
                </>
              ) : (
                <>
                  <Txt variant="h2" numberOfLines={2}>
                    {highlight.exerciseName}
                  </Txt>
                  <Txt variant="small" color="text2">
                    New best set{highlight.value !== null ? `: ${highlight.value}` : ''}
                  </Txt>
                </>
              )}
            </View>
          </View>
        </Card>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    wrap: { width: '100%' },
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
    card: { overflow: 'hidden' },
    shineClip: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: radius.lg,
      overflow: 'hidden',
    },
    shine: {
      position: 'absolute',
      top: -60,
      bottom: -60,
      width: 60,
      backgroundColor: withAlpha(t.vivid.sun, 0.18),
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    body: { flex: 1, gap: 2 },
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    family: { flex: 1, marginRight: space.sm },
    from: { textDecorationLine: 'line-through' },
    barTrack: {
      marginTop: space.sm,
      height: 10,
      borderRadius: radius.pill,
      backgroundColor: t.colors.surface2,
      overflow: 'hidden',
    },
    barFill: { height: '100%', borderRadius: radius.pill, overflow: 'hidden' },
  }),
);
