/**
 * The Logbook's month control as one teal pill: ‹ label ›. The chevrons step a month (each dims at
 * its bound); the label opens the month picker. One surface, so it reads as a single control.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { makeStyles, radius, space } from '../theme';
import { Icon, PressableScale, Txt } from '../ui';

export interface MonthStepperProps {
  label: string;
  /** Spoken name for the label button, e.g. "March 2026 — choose a month". */
  labelAccessibilityLabel: string;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPressLabel: () => void;
  testID?: string;
}

export function MonthStepper({
  label,
  labelAccessibilityLabel,
  prevDisabled,
  nextDisabled,
  onPrev,
  onNext,
  onPressLabel,
  testID,
}: MonthStepperProps): React.JSX.Element {
  const styles = useStyles();
  return (
    <View testID={testID} style={styles.pill}>
      <PressableScale
        testID="logbook-prev"
        onPress={onPrev}
        disabled={prevDisabled}
        accessibilityRole="button"
        accessibilityLabel="Previous month"
        accessibilityState={{ disabled: prevDisabled }}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 0 }}
        style={[styles.step, prevDisabled && styles.disabled]}
      >
        <Icon name="back" size={16} color="teal" />
      </PressableScale>
      <PressableScale
        testID="logbook-month-label"
        onPress={onPressLabel}
        accessibilityRole="button"
        accessibilityLabel={labelAccessibilityLabel}
        hitSlop={{ top: 8, bottom: 8 }}
        style={styles.label}
      >
        <Txt variant="eyebrow" color="teal" numberOfLines={1}>
          {label}
        </Txt>
      </PressableScale>
      <PressableScale
        testID="logbook-next"
        onPress={onNext}
        disabled={nextDisabled}
        accessibilityRole="button"
        accessibilityLabel="Next month"
        accessibilityState={{ disabled: nextDisabled }}
        hitSlop={{ top: 8, bottom: 8, left: 0, right: 4 }}
        style={[styles.step, nextDisabled && styles.disabled]}
      >
        <Icon name="chevronRight" size={16} color="teal" />
      </PressableScale>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radius.pill,
      backgroundColor: t.tints.teal,
    },
    step: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    label: { paddingHorizontal: space.xs, minHeight: 36, justifyContent: 'center' },
    disabled: { opacity: 0.4 },
  }),
);
