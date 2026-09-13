/**
 * §8.1 — "One control, optional, on the rest screen": a 3-position difficulty segment (unset
 * means "just right"). Never required, never blocking, never nagged, never solicited twice —
 * this component only ever renders on the rest screen, its one home per the spec.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type Difficulty = 'too_easy' | 'just_right' | 'too_hard';

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 'too_easy', label: 'Too easy' },
  { value: 'just_right', label: 'Just right' },
  { value: 'too_hard', label: 'Too hard' },
];

export default function FeedbackControls({
  difficulty,
  onDifficultyChange,
}: {
  difficulty: Difficulty | null;
  onDifficultyChange: (d: Difficulty | undefined) => void;
}): React.JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.segment} testID="difficulty-segment">
        {DIFFICULTY_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            testID={`difficulty-${opt.value}`}
            style={[styles.segmentItem, difficulty === opt.value && styles.segmentItemSelected]}
            onPress={() => onDifficultyChange(difficulty === opt.value ? undefined : opt.value)}
          >
            <Text
              style={[styles.segmentText, difficulty === opt.value && styles.segmentTextSelected]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // `width: '100%'` is load-bearing: every caller renders this inside an `alignItems: 'center'`
  // hero (a shrink-wrap context), so without an explicit width `segment`'s `flex: 1` children
  // have nothing to divide and collapse toward zero — invisible to RNTL (it never runs real
  // Yoga layout), only caught by actually running the app.
  container: { gap: 12, width: '100%' },
  segment: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 12, padding: 4 },
  segmentItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  segmentItemSelected: { backgroundColor: '#fff' },
  segmentText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  segmentTextSelected: { color: '#0f172a' },
});
