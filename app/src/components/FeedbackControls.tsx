/**
 * §8.1 — "Exactly two controls, both optional, both on the rest screen": a 3-position difficulty
 * segment (unset means "just right") and a five-emoji enjoyment row (unset is neutral, tapping
 * the same emoji again clears it). Never required, never blocking, never nagged, never solicited
 * twice — this component only ever renders on the rest screen, its one home per the spec.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type Difficulty = 'too_easy' | 'just_right' | 'too_hard';

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 'too_easy', label: 'Too easy' },
  { value: 'just_right', label: 'Just right' },
  { value: 'too_hard', label: 'Too hard' },
];

const EMOJIS = ['😩', '😞', '😕', '🙂', '😄'];

export default function FeedbackControls({
  difficulty,
  enjoyment,
  onDifficultyChange,
  onEnjoymentChange,
}: {
  difficulty: Difficulty | null;
  enjoyment: number | null;
  onDifficultyChange: (d: Difficulty | undefined) => void;
  onEnjoymentChange: (e: number | undefined) => void;
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

      <View style={styles.emojiRow} testID="enjoyment-row">
        {EMOJIS.map((emoji, i) => {
          const value = i + 1;
          const selected = enjoyment === value;
          return (
            <Pressable
              key={emoji}
              testID={`enjoyment-${value}`}
              onPress={() => onEnjoymentChange(selected ? undefined : value)}
              style={[styles.emojiButton, selected && styles.emojiButtonSelected]}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
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
  emojiRow: { flexDirection: 'row', justifyContent: 'space-between' },
  emojiButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiButtonSelected: { backgroundColor: '#dbeafe' },
  emoji: { fontSize: 24 },
});
