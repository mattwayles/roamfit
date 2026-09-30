/**
 * The completion screen's headline, slammed in one word at a time: each word drops from oversized
 * and tilted down onto the page with a hard spring, like a stamp. Barlow Condensed 800 in `text`,
 * the last word in `sun`, every word stamped in light with an ember glow (DESIGN.md §5.9). The screen fires a haptic tick
 * per word on the same `WORD_STAGGER_MS` beat (`lib/completionTimeline.ts`), and the heavy hit +
 * confetti on the last, so the words are felt landing, not just seen. `bounce` is bumped by the screen whenever the user taps
 * the headline, for a re-slam.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { WORD_STAGGER_MS } from '../lib/completionTimeline';
import { colors, numeralMaxFontScale, space, type, withAlpha } from '../theme';

function Word({
  text,
  index,
  accent,
}: {
  text: string;
  index: number;
  accent: boolean;
}): React.JSX.Element {
  const land = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(index * WORD_STAGGER_MS),
      Animated.spring(land, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [index, land]);

  return (
    <Animated.Text
      maxFontSizeMultiplier={numeralMaxFontScale}
      style={[
        styles.word,
        accent && styles.accent,
        {
          opacity: land.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }),
          transform: [
            { scale: land.interpolate({ inputRange: [0, 1], outputRange: [3, 1] }) },
            {
              rotate: land.interpolate({
                inputRange: [0, 1],
                outputRange: [index % 2 === 0 ? '-14deg' : '12deg', '0deg'],
              }),
            },
          ],
        },
      ]}
    >
      {text}
    </Animated.Text>
  );
}

export default function HypeHeadline({
  text,
  bounce,
}: {
  text: string;
  bounce: Animated.Value;
}): React.JSX.Element {
  const words = text.split(' ');
  return (
    <Animated.View
      accessible
      accessibilityRole="header"
      accessibilityLabel={text}
      style={[
        styles.row,
        {
          transform: [
            { scale: bounce.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
          ],
        },
      ]}
    >
      {words.map((w, i) => (
        <View key={`${i}-${w}`}>
          <Word text={w} index={i} accent={i === words.length - 1} />
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: space.sm + 2,
  },
  word: {
    ...type.display,
    color: colors.text,
    textAlign: 'center',
    textShadowColor: withAlpha(colors.ember, 0.9),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  accent: { color: colors.sun },
});
