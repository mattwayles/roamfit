/**
 * Track 37f/37h — training days per week (`weekly_target`), 1-7, as a -/+ stepper. Shared by
 * Settings → Training preferences and onboarding. The caller persists.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { space } from '../theme';
import { IconButton, Txt } from '../ui';

export const MIN_TRAINING_DAYS = 1;
export const MAX_TRAINING_DAYS = 7;

export const DAYS_PER_WEEK_CAPTION =
  'Your weekly target. Motivation reminders celebrate the weeks you reach it; a week that falls ' +
  'short is never mentioned.';

export function DaysPerWeekStepper({
  days,
  onChange,
}: {
  days: number;
  onChange: (next: number) => void;
}): React.JSX.Element {
  return (
    <View
      style={styles.stepper}
      testID="pref-days"
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Training days per week"
      accessibilityValue={{ min: MIN_TRAINING_DAYS, max: MAX_TRAINING_DAYS, now: days }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment')
          onChange(Math.min(MAX_TRAINING_DAYS, days + 1));
        if (e.nativeEvent.actionName === 'decrement')
          onChange(Math.max(MIN_TRAINING_DAYS, days - 1));
      }}
    >
      <IconButton
        testID="pref-days-minus"
        icon="remove"
        accessibilityLabel="One fewer training day"
        disabled={days <= MIN_TRAINING_DAYS}
        onPress={() => onChange(Math.max(MIN_TRAINING_DAYS, days - 1))}
      />
      <Txt variant="h2" style={styles.value} testID="pref-days-value">
        {days}
      </Txt>
      <IconButton
        testID="pref-days-plus"
        icon="add"
        accessibilityLabel="One more training day"
        disabled={days >= MAX_TRAINING_DAYS}
        onPress={() => onChange(Math.min(MAX_TRAINING_DAYS, days + 1))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    padding: space.md,
  },
  value: { minWidth: 48, textAlign: 'center' },
});
