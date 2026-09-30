/**
 * One calendar day, shared by Today's "This week" strip (fixed 40pt) and Journey's Logbook
 * (fills its grid column). Tint and glyph come from `lib/dayMarkers` so the two surfaces always
 * agree; an untrained day is a plain `surface` cell (neutral, never empty-looking-bad — invariant
 * 4) and today gets a 2px ember ring rather than a color, so it never reads as a workout state.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius, withAlpha } from '../theme';
import { PressableScale, Txt } from '../ui';
import type { CalendarDay } from '../lib/dashboard';
import { markerColor, markerEmoji, markerLabel } from '../lib/dayMarkers';

export interface DayCellProps {
  day: CalendarDay | null;
  isToday: boolean;
  onPress?: () => void;
  /** Fixed square edge in pt; omit to fill a flex row (Logbook). */
  size?: number;
  testID?: string;
  accessibilityLabel?: string;
}

export function DayCell({
  day,
  isToday,
  onPress,
  size,
  testID,
  accessibilityLabel,
}: DayCellProps): React.JSX.Element {
  const box = size ? { width: size, height: size } : styles.fill;
  if (day === null) return <View style={box} />;

  const tint = markerColor(day.marker);
  const emoji = markerEmoji(day.marker);
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      haptic="selection"
      scaleTo={0.9}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${markerLabel(day.marker)} — tap to edit`}
      style={[
        styles.cell,
        box,
        {
          backgroundColor: tint ? withAlpha(tint, 0.2) : colors.surface,
          borderColor: tint ? withAlpha(tint, 0.55) : colors.line,
        },
        isToday && styles.today,
      ]}
    >
      <Txt variant="caption" color={tint ? 'text' : 'text3'} style={styles.date}>
        {Number(day.localDate.split('-')[2])}
      </Txt>
      {emoji !== '' ? (
        <Txt variant="h3" style={styles.emoji}>
          {emoji}
        </Txt>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, aspectRatio: 1 },
  cell: {
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  today: { borderWidth: 2, borderColor: colors.ember },
  date: { position: 'absolute', top: 2, left: 5 },
  emoji: { lineHeight: 24, marginTop: 6 },
});
