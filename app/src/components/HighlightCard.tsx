/**
 * One level-up (or Mastery best set) on the completion screen — what used to be its own
 * step-through full-screen interrupt, now the completion screen's crescendo. Laid out from the
 * start (so revealing it never shifts the page), invisible and untappable until `revealed`, then:
 * stamped down with an overshooting spring, a pulsing gold glow behind it, a shine sweeping across
 * it on a loop, and — for a level-up — the "Level N of M" bar filling from the old rung to the
 * new one. Plain `Animated` API throughout.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { HighlightCelebration } from '../lib/celebration';

interface Props {
  highlight: HighlightCelebration;
  revealed: boolean;
  /** Reduce Motion: keep the stamp-in, drop the looping glow/shine. */
  still: boolean;
  onShare: () => void;
  testID: string;
}

export default function HighlightCard({
  highlight,
  revealed,
  still,
  onShare,
  testID,
}: Props): React.JSX.Element {
  const stamp = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
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
          Animated.timing(glow, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0, duration: 700, useNativeDriver: true }),
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
  }, [revealed, still, stamp, glow, shine, fill, fromFraction, toFraction]);

  return (
    <View testID={testID} pointerEvents={revealed ? 'auto' : 'none'} style={styles.wrap}>
      <Animated.View
        style={[
          styles.glow,
          {
            opacity: Animated.multiply(
              stamp.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
              glow.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.9] }),
            ),
            transform: [
              { scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.card,
          {
            opacity: stamp.interpolate({
              inputRange: [0, 0.2, 1],
              outputRange: [0, 1, 1],
              extrapolate: 'clamp',
            }),
            transform: [
              { scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] }) },
              {
                rotate: stamp.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '0deg'] }),
              },
            ],
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shine,
            {
              transform: [
                { translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-160, 520] }) },
                { rotate: '20deg' },
              ],
            },
          ]}
        />

        <View style={styles.topRow}>
          <Text style={styles.emoji}>{isLevelUp ? '🚀' : '🏆'}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{isLevelUp ? 'LEVEL UP!' : 'MASTERY PR!'}</Text>
          </View>
        </View>

        <Text style={styles.family}>{highlight.familyName}</Text>

        {highlight.kind === 'level_up' ? (
          <>
            {highlight.fromExerciseName && (
              <Text style={styles.from} numberOfLines={1}>
                {highlight.fromExerciseName}
              </Text>
            )}
            <Text style={styles.to}>⬆ {highlight.newExerciseName}</Text>
            <View style={styles.barTrack}>
              <Animated.View
                style={[
                  styles.barFill,
                  { width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
                ]}
              />
            </View>
            <Text style={styles.levelText}>
              Level {highlight.levelN} of {highlight.levelOf}
            </Text>
          </>
        ) : (
          <Text style={styles.to}>
            New best set — {highlight.exerciseName}
            {highlight.value !== null ? `: ${highlight.value}` : ''}
          </Text>
        )}

        <Pressable testID={`${testID}-share`} style={styles.share} onPress={onShare} hitSlop={6}>
          <Text style={styles.shareText}>Share it 📣</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  glow: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 26,
    backgroundColor: '#fde047',
  },
  card: {
    backgroundColor: '#fef08a',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#ffffff',
    padding: 16,
    gap: 4,
    overflow: 'hidden',
  },
  shine: {
    position: 'absolute',
    top: -60,
    bottom: -60,
    width: 60,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emoji: { fontSize: 30 },
  badge: {
    backgroundColor: '#7c3aed',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  family: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '800',
    color: '#a16207',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  from: {
    fontSize: 14,
    color: '#854d0e',
    textDecorationLine: 'line-through',
    opacity: 0.7,
  },
  to: { fontSize: 22, fontWeight: '900', color: '#422006' },
  barTrack: {
    marginTop: 8,
    height: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(66, 32, 6, 0.15)',
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 999, backgroundColor: '#7c3aed' },
  levelText: { fontSize: 12, fontWeight: '800', color: '#713f12', marginTop: 2 },
  share: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  shareText: { color: '#6d28d9', fontWeight: '800', fontSize: 14 },
});
