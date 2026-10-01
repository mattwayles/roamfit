/**
 * The completion screen's headline, slammed in one word at a time: each word drops from oversized
 * and tilted down onto the page with a hard spring, like a stamp. Barlow Condensed 800 in `text`,
 * the last word in the theme's `stamp.fill`, stamped with a hard zero-blur `stamp.shadow` offset and
 * (Golden Hour only) lit with a soft `stamp.glow` (DESIGN.md §5.9, §8.3). React Native allows one `textShadow` per Text, so each word is
 * two layers: a copy underneath (offset down-right, `emberDeep`, carrying the glow) and the real
 * word on top. The copy is hidden from accessibility, so the headline still reads once. A forward
 * lean (`skewX`, on a static wrapper — Barlow Condensed has no italic face loaded, and the native
 * driver only needs to see the animated transforms) keeps the stamped-on feel the old headline
 * had. The screen fires a haptic tick per word on the same `WORD_STAGGER_MS` beat
 * (`lib/completionTimeline.ts`), and the heavy hit + confetti on the last, so the words are felt
 * landing, not just seen. `bounce` is bumped by the screen whenever the user taps the headline,
 * for a re-slam.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { WORD_STAGGER_MS } from '../lib/completionTimeline';
import { makeStyles, numeralMaxFontScale, space, useTheme, withAlpha } from '../theme';
import { Txt } from '../ui';

/** How far the hard shadow sits down-right of the letters, in pt. */
const STAMP_OFFSET_X = 3;
const STAMP_OFFSET_Y = 4;

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
  const theme = useTheme();
  const styles = useStyles();
  const { stamp } = theme;

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(index * WORD_STAGGER_MS),
      Animated.spring(land, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [index, land]);

  return (
    <Animated.View
      style={{
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
      }}
    >
      <View style={styles.stamp}>
        <Txt
          testID={`hype-word-${index}-shadow`}
          variant="display"
          maxFontSizeMultiplier={numeralMaxFontScale}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.word,
            styles.shadowLayer,
            { color: stamp.shadow },
            stamp.glow ? { textShadowColor: withAlpha(stamp.glow, 0.9) } : styles.noGlow,
          ]}
        >
          {text}
        </Txt>
        <Txt
          testID={`hype-word-${index}`}
          variant="display"
          color={accent ? undefined : 'text'}
          maxFontSizeMultiplier={numeralMaxFontScale}
          style={accent ? [styles.word, { color: stamp.fill }] : styles.word}
        >
          {text}
        </Txt>
      </View>
    </Animated.View>
  );
}

export default function HypeHeadline({
  text,
  bounce,
}: {
  text: string;
  bounce: Animated.Value;
}): React.JSX.Element {
  const styles = useStyles();
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

const useStyles = makeStyles(() =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      columnGap: space.sm + 2,
    },
    // A static lean, deliberately outside the Animated transforms (see the header).
    stamp: { transform: [{ skewX: '-8deg' }] },
    word: { textAlign: 'center' },
    // The hard stamp: zero blur, straight down-right. It carries the ember glow too, so the light
    // radiates from the whole stamped shape while the letters on top stay crisp.
    shadowLayer: {
      position: 'absolute',
      // left + right (not just left): the copy must be exactly as wide as the word or it re-wraps.
      left: STAMP_OFFSET_X,
      right: -STAMP_OFFSET_X,
      top: STAMP_OFFSET_Y,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 16,
    },
    // Daylight: no glow, so the copy carries no textShadow at all.
    noGlow: { textShadowRadius: 0 },
  }),
);
