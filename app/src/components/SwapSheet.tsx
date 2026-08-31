/**
 * §10.6 mid-workout swap picker. Pure presentation — the 3-5 alternatives it lists come from
 * `@roamfit/engine`'s `alternativesForSlot` (called by the screen, never here); this component
 * only renders what it's handed and reports taps. No selection/ranking logic lives in this file.
 */
import React from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { SwapAlternative } from '@roamfit/engine';

export interface SwapSheetProps {
  alternatives: SwapAlternative[];
  excludeAnchor: boolean;
  onToggleExcludeAnchor: (value: boolean) => void;
  onSelect: (alt: SwapAlternative) => void;
  onCancel: () => void;
}

export default function SwapSheet({
  alternatives,
  excludeAnchor,
  onToggleExcludeAnchor,
  onSelect,
  onCancel,
}: SwapSheetProps): React.JSX.Element {
  return (
    <View style={styles.sheet} testID="swap-sheet">
      <Text style={styles.title}>Swap this exercise</Text>

      <View style={styles.anchorRow}>
        <Text style={styles.anchorLabel}>Different anchor point</Text>
        <Switch
          testID="swap-different-anchor"
          value={excludeAnchor}
          onValueChange={onToggleExcludeAnchor}
        />
      </View>

      {alternatives.length === 0 ? (
        <Text style={styles.empty}>No alternatives fit right now — try clearing the filter.</Text>
      ) : (
        alternatives.map((alt) => (
          <Pressable
            key={alt.exercise.id}
            testID={`swap-option-${alt.exercise.id}`}
            style={styles.option}
            onPress={() => onSelect(alt)}
          >
            <Text style={styles.optionName}>{alt.exercise.name}</Text>
            <Text style={styles.optionMeta}>
              {alt.replacement.durationSec != null
                ? `${alt.replacement.durationSec}s`
                : `${alt.replacement.repTarget ?? '—'} reps`}{' '}
              · {alt.replacement.sets} sets
            </Text>
          </Pressable>
        ))
      )}

      <Pressable testID="swap-cancel" style={styles.cancel} onPress={onCancel}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    gap: 10,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  title: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  anchorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  anchorLabel: { fontSize: 13, color: '#334155', fontWeight: '600' },
  empty: { fontSize: 13, color: '#64748b' },
  option: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  optionName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  optionMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  cancel: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { color: '#64748b', fontWeight: '600' },
});
