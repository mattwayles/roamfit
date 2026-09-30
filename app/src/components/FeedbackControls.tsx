/**
 * §8.1 — "One control, optional, on the rest screen": a 3-position difficulty segment (unset
 * means "just right"). Never required, never blocking, never nagged, never solicited twice —
 * this component only ever renders on the rest screen, its one home per the spec.
 *
 * Labels stay as words (colour alone is not a label). A selected option fills with its own accent
 * — Too easy = lagoon, Just right = ember, Too hard = summit — and there is no red anywhere: "too
 * hard" is information, not an error (invariant 4).
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius, space, type AccentName } from '../theme';
import { PressableScale, Txt } from '../ui';

export type Difficulty = 'too_easy' | 'just_right' | 'too_hard';

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string; tone: AccentName }[] = [
  { value: 'too_easy', label: 'Too easy', tone: 'lagoon' },
  { value: 'just_right', label: 'Just right', tone: 'ember' },
  { value: 'too_hard', label: 'Too hard', tone: 'summit' },
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
        {DIFFICULTY_OPTIONS.map((opt) => {
          const selected = difficulty === opt.value;
          return (
            <PressableScale
              key={opt.value}
              testID={`difficulty-${opt.value}`}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              accessibilityState={{ selected }}
              style={[styles.item, selected && { backgroundColor: colors[opt.tone] }]}
              onPress={() => onDifficultyChange(selected ? undefined : opt.value)}
            >
              <Txt variant="bodyStrong" color={selected ? 'ink' : 'text2'} numberOfLines={1}>
                {opt.label}
              </Txt>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // `width: '100%'` is load-bearing: every caller renders this inside an `alignItems: 'center'`
  // hero (a shrink-wrap context), so without an explicit width `segment`'s `flex: 1` children
  // have nothing to divide and collapse toward zero — invisible to RNTL (it never runs real
  // Yoga layout), only caught by actually running the app.
  container: { width: '100%' },
  segment: {
    flexDirection: 'row',
    gap: space.xs,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.xs,
  },
  item: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: space.xs,
  },
});
