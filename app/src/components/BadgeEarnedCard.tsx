/**
 * One badge earned this session, on the completion screen (Track 38d). Laid out from the start so
 * revealing it never shifts the page, invisible and untappable until `revealed`; then the emblem
 * pops in with a spring and the card fades up. A quieter sibling of `HighlightCard`: same
 * `golden` border, no looping glow or shine. Reduce Motion (`still`): the card is simply there,
 * with no pop. Share is the same `IconButton` the highlights use.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import type { ShelfBadge } from '../lib/badges';
import { makeStyles, space, useTheme } from '../theme';
import { Card, IconButton, Txt } from '../ui';
import { BadgeEmblem } from './BadgeEmblem';

interface Props {
  badge: ShelfBadge;
  revealed: boolean;
  /** Reduce Motion: no pop, no fade. */
  still: boolean;
  onShare: () => void;
  testID: string;
}

export default function BadgeEarnedCard({
  badge,
  revealed,
  still,
  onShare,
  testID,
}: Props): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  const card = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!revealed) return;
    // Reduce Motion: nothing to animate; the render below shows the card as soon as it's revealed.
    if (still) return;
    const fade = Animated.timing(card, { toValue: 1, duration: 220, useNativeDriver: true });
    const emblemIn = Animated.sequence([
      Animated.delay(120),
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }),
    ]);
    fade.start();
    emblemIn.start();
    return () => {
      fade.stop();
      emblemIn.stop();
    };
  }, [revealed, still, card, pop]);

  return (
    <View
      testID={testID}
      pointerEvents={revealed ? 'auto' : 'none'}
      accessibilityElementsHidden={!revealed}
      importantForAccessibility={revealed ? 'auto' : 'no-hide-descendants'}
      style={styles.wrap}
    >
      <Animated.View style={{ opacity: still ? (revealed ? 1 : 0) : card }}>
        <Card variant="accent" gradient={theme.gradients.golden} padding="md">
          <View style={styles.row}>
            <Animated.View
              style={
                still
                  ? undefined
                  : {
                      opacity: pop.interpolate({
                        inputRange: [0, 0.2, 1],
                        outputRange: [0, 1, 1],
                        extrapolate: 'clamp',
                      }),
                      transform: [
                        { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
                      ],
                    }
              }
            >
              <BadgeEmblem badge={badge} size={64} testID={`${testID}-emblem`} />
            </Animated.View>
            <View style={styles.body}>
              <View style={styles.headRow}>
                <Txt variant="eyebrow" color="gold" style={styles.eyebrow}>
                  BADGE EARNED
                </Txt>
                <IconButton
                  testID={`${testID}-share`}
                  icon="share"
                  size="md"
                  accessibilityLabel={`Share ${badge.def.name} badge`}
                  onPress={onShare}
                />
              </View>
              <Txt variant="h2" numberOfLines={2}>
                {badge.def.name}
              </Txt>
              <Txt variant="small" color="text2">
                {badge.def.description}
              </Txt>
            </View>
          </View>
        </Card>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    wrap: { width: '100%' },
    row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    body: { flex: 1, gap: 2 },
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    eyebrow: { flex: 1, marginRight: space.sm, letterSpacing: 1.5 },
  }),
);
