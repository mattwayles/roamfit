/**
 * §10.2 — a drop-down picker for a single choice: a closed field showing the current value, which
 * opens a list to change it.
 *
 * Replaces the wrapped chip rows the Generate screen used. Chips were fine at four options and
 * poor at seven (Time now runs 15 → 120): they wrapped onto two or three lines, so each section
 * grew and shrank as its options changed and the screen stopped being scannable. A drop-down is
 * one line tall whatever the option count, and it shows the current answer without the reader
 * having to spot which of seven equal-weight buttons is highlighted.
 *
 * Built on core components rather than `@react-native-picker/picker`, which is a native module
 * and would therefore need an Expo dev-client rebuild before the app would launch at all — steep
 * for a control this simple.
 *
 * Open state is owned by the caller, not by this component, so that opening one picker closes any
 * other. Two lists open at once on a short screen is how you end up choosing from the wrong one.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

/** Beyond this the list scrolls rather than pushing the rest of the form off screen. Sized to
 *  show about five rows, so it always reads as a list that continues. */
const LIST_MAX_HEIGHT = 224;

export interface OptionPickerOption<T> {
  value: T;
  label: string;
}

export default function OptionPicker<T extends string | number>({
  options,
  value,
  onChange,
  open,
  onOpenChange,
  testID,
  accessibilityLabel,
}: {
  options: readonly OptionPickerOption<T>[];
  value: T;
  onChange: (value: T) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The trigger carries this id; each option is `${testID}-option-${value}`. */
  testID: string;
  accessibilityLabel: string;
}): React.JSX.Element {
  const selected = options.find((o) => o.value === value);

  return (
    <View style={open ? styles.rootOpen : undefined}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: selected?.label }}
        style={[styles.trigger, open && styles.triggerOpen]}
        onPress={() => onOpenChange(!open)}
      >
        <Text style={styles.triggerText} numberOfLines={1}>
          {selected?.label ?? ''}
        </Text>
        <Text style={styles.caret}>{open ? '▴' : '▾'}</Text>
      </Pressable>

      {open && (
        <View style={styles.list} testID={`${testID}-list`}>
          <ScrollView
            style={styles.listScroll}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <Pressable
                  key={String(option.value)}
                  testID={`${testID}-option-${option.value}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={option.label}
                  style={[styles.option, isSelected && styles.optionSelected]}
                  onPress={() => {
                    onChange(option.value);
                    onOpenChange(false);
                  }}
                >
                  <Text
                    style={[styles.optionText, isSelected && styles.optionTextSelected]}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                  {isSelected && <Text style={styles.tick}>{'✓'}</Text>}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /** The open list overlays what follows instead of pushing it down, so three pickers sitting
   *  side by side keep their row height (and each other's alignment) when one of them opens.
   *  Needs the open picker to paint above its siblings, hence the lift. */
  rootOpen: { zIndex: 10 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
  },
  triggerOpen: { borderColor: '#111', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  // 15pt, not 16: three of these share a phone width now, and "Full body" has to fit beside the
  // caret without truncating.
  triggerText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0f172a' },
  caret: { fontSize: 13, color: '#64748b', paddingLeft: 6 },
  list: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#111',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  listScroll: { maxHeight: LIST_MAX_HEIGHT },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  optionSelected: { backgroundColor: '#f1f5f9' },
  optionText: { flex: 1, fontSize: 15, color: '#334155' },
  optionTextSelected: { fontWeight: '700', color: '#0f172a' },
  tick: { fontSize: 14, fontWeight: '700', color: '#111', paddingLeft: 8 },
});
