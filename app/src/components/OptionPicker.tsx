/**
 * §10.2 — a horizontally scrolling, snap-to-centre picker for a single choice.
 *
 * Replaces the wrapped chip rows the Generate screen used. Chips were fine at four options and
 * poor at seven (Time now runs 15 → 120): they wrapped onto two or three lines, so each section
 * grew and shrank as options changed, and the whole picker stopped being scannable at a glance.
 * A single scrolling row is a fixed height whatever the option count, and reads as one control
 * rather than a field of equal-weight buttons.
 *
 * Built on core `ScrollView` rather than `@react-native-picker/picker`, which is a native module
 * and would therefore need an Expo dev-client rebuild before the app would launch at all. That is
 * a heavy price for a control this simple, and the wheel idiom would cost far more vertical space
 * for three of them stacked than this does.
 *
 * Selection is by tap **or** by scrolling — `onMomentumScrollEnd` snaps to whichever option
 * settled under the centre. Tapping is what tests drive, and is also the faster interaction when
 * the option you want is already visible.
 */
import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

/** Item width and gap are fixed so the snap interval is a constant the scroll handler can divide
 *  by, rather than something measured per item. */
const ITEM_WIDTH = 96;
const ITEM_GAP = 8;
const SNAP = ITEM_WIDTH + ITEM_GAP;

export interface OptionPickerOption<T> {
  value: T;
  label: string;
}

export default function OptionPicker<T extends string | number>({
  options,
  value,
  onChange,
  testID,
  accessibilityLabel,
}: {
  options: readonly OptionPickerOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Per-option test ids are derived as `${testID}-option-${value}`. */
  testID: string;
  accessibilityLabel: string;
}): React.JSX.Element {
  const scrollRef = useRef<ScrollView>(null);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  // Keep the row in sync when the value changes from outside (a default, or a reset). Not a
  // feedback loop with the scroll handler: that only fires on user-driven momentum, and
  // scrolling to an offset the view already holds is a no-op.
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: index * SNAP, animated: true });
  }, [index]);

  return (
    <View style={styles.wrapper}>
      <ScrollView
        ref={scrollRef}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP}
        decelerationRate="fast"
        contentContainerStyle={styles.content}
        onMomentumScrollEnd={(e) => {
          const settled = Math.round(e.nativeEvent.contentOffset.x / SNAP);
          const clamped = Math.min(Math.max(settled, 0), options.length - 1);
          const next = options[clamped];
          if (next && next.value !== value) onChange(next.value);
        }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              testID={`${testID}-option-${option.value}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              style={[styles.item, selected && styles.itemSelected]}
              onPress={() => onChange(option.value)}
            >
              <Text
                style={[styles.itemText, selected && styles.itemTextSelected]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginHorizontal: -4 },
  content: { gap: ITEM_GAP, paddingHorizontal: 4, paddingVertical: 2 },
  item: {
    width: ITEM_WIDTH,
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  itemSelected: { backgroundColor: '#111', borderColor: '#111' },
  itemText: { fontSize: 15, fontWeight: '600', color: '#475569' },
  itemTextSelected: { color: '#fff' },
});
