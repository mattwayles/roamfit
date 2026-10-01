/**
 * A number that counts up from 0 to its value once, then holds — the completion screen's stat
 * grid (see SummaryScreen.tsx) uses one of these per tile so the numbers read as *earned* rather
 * than printed. The tile itself pops in with a spring at its `delay`, and bumps once more when the
 * count lands. Plain `Animated` API, no new dependency (matches `ConfettiBurst`'s own reasoning).
 *
 * Counting a `Text` node's displayed digits can't run on the native driver (it isn't a
 * transform/opacity), so this uses the standard RN pattern of an `Animated.Value` + a listener
 * that mirrors its current number into local state on every tick. The pop/bump is a separate,
 * native-driven value.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { makeStyles, radius, space, withAlpha } from '../theme';
import { Txt } from '../ui';

interface Props {
  value: number;
  label: string;
  /** Appended after the number with no space, e.g. "s" for seconds — kept out of the counted
   *  value so the animation only ever touches digits. */
  suffix?: string;
  /** Stagger start, ms — lets a row of tiles count up one after another instead of all at once. */
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  valueStyle?: StyleProp<TextStyle>;
  labelStyle?: StyleProp<TextStyle>;
  testID?: string;
}

export default function AnimatedStatCounter({
  value,
  label,
  suffix = '',
  delay = 0,
  duration = 700,
  style,
  valueStyle,
  labelStyle,
  testID,
}: Props): React.JSX.Element {
  const styles = useStyles();
  const progress = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    setDisplayValue(0);
    progress.setValue(0);
    pop.setValue(0);
    const id = progress.addListener(({ value: v }) => setDisplayValue(Math.round(v)));
    const count = Animated.timing(progress, {
      toValue: value,
      duration,
      delay,
      useNativeDriver: false,
    });
    const popIn = Animated.sequence([
      Animated.delay(delay),
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
    ]);
    const landBump = Animated.sequence([
      Animated.delay(delay + duration),
      Animated.timing(pop, { toValue: 1.25, duration: 90, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 3, tension: 160, useNativeDriver: true }),
    ]);
    count.start();
    popIn.start();
    landBump.start();
    return () => {
      count.stop();
      popIn.stop();
      landBump.stop();
      progress.removeListener(id);
    };
    // `progress`/`pop` are stable refs for the component's lifetime — value/delay/duration are the
    // only real inputs to this effect (no react-hooks lint plugin is configured in this project to
    // flag the omission).
  }, [value, delay, duration]);

  return (
    <Animated.View
      style={[
        styles.cell,
        style,
        {
          opacity: pop.interpolate({
            inputRange: [0, 0.3],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          }),
          transform: [{ scale: pop }],
        },
      ]}
      testID={testID}
    >
      <Txt
        variant="hero"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
        style={valueStyle}
        testID={testID ? `${testID}-value` : undefined}
      >
        {displayValue}
        {suffix}
      </Txt>
      <Txt variant="eyebrow" color="gold" numberOfLines={1} style={labelStyle}>
        {label}
      </Txt>
    </Animated.View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    cell: {
      alignItems: 'center',
      minWidth: 96,
      gap: space.xs,
      paddingVertical: space.md,
      paddingHorizontal: space.md,
      backgroundColor: withAlpha(t.colors.surface, 0.85),
      borderWidth: 1,
      borderColor: t.colors.line,
      borderRadius: radius.lg,
    },
  }),
);
