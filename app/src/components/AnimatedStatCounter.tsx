/**
 * A number that counts up from 0 to its value once, then holds — the completion screen's stat
 * grid (see SummaryScreen.tsx) uses one of these per tile so the numbers read as *earned* rather
 * than printed. Plain `Animated` API, no new dependency (matches `ConfettiBurst`'s own reasoning).
 *
 * Counting a `Text` node's displayed digits can't run on the native driver (it isn't a
 * transform/opacity), so this uses the standard RN pattern of an `Animated.Value` + a listener
 * that mirrors its current number into local state on every tick.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

interface Props {
  value: number;
  label: string;
  /** Appended after the number with no space, e.g. "s" for seconds — kept out of the counted
   *  value so the animation only ever touches digits. */
  suffix?: string;
  /** Stagger start, ms — lets a row of tiles count up one after another instead of all at once. */
  delay?: number;
  duration?: number;
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
  valueStyle,
  labelStyle,
  testID,
}: Props): React.JSX.Element {
  const progress = useRef(new Animated.Value(0)).current;
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    setDisplayValue(0);
    progress.setValue(0);
    const id = progress.addListener(({ value: v }) => setDisplayValue(Math.round(v)));
    const anim = Animated.timing(progress, {
      toValue: value,
      duration,
      delay,
      useNativeDriver: false,
    });
    anim.start();
    return () => {
      anim.stop();
      progress.removeListener(id);
    };
    // `progress` is a stable ref for the component's lifetime — value/delay/duration are the only
    // real inputs to this effect (no react-hooks lint plugin is configured in this project to
    // flag the omission).
  }, [value, delay, duration]);

  return (
    <View style={styles.cell} testID={testID}>
      <Text style={[styles.value, valueStyle]} testID={testID ? `${testID}-value` : undefined}>
        {displayValue}
        {suffix}
      </Text>
      <Text style={[styles.label, labelStyle]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { alignItems: 'center', minWidth: 72, gap: 2 },
  value: { fontSize: 22, fontWeight: '800', color: '#fff' },
  label: { fontSize: 11, fontWeight: '600', color: '#e9d5ff', textTransform: 'uppercase' },
});
