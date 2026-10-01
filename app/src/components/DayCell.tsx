/**
 * One calendar day, shared by Today's "This week" strip (fixed 40pt) and Journey's Logbook
 * (fills its grid column). Tint and glyph come from `lib/dayMarkers` so the two surfaces always
 * agree; an untrained day is a plain `surface` cell (neutral, never empty-looking-bad — invariant
 * 4) and today gets a 2px ember ring rather than a color, so it never reads as a workout state.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { makeStyles, radius, useTheme } from '../theme';
import { PressableScale, Txt } from '../ui';
import type { CalendarDay } from '../lib/dashboard';
import { markerEmoji, markerLabel, markerTone } from '../lib/dayMarkers';

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
  const theme = useTheme();
  const styles = useStyles();
  const box = size ? { width: size, height: size } : styles.fill;
  if (day === null) return <View style={box} />;

  const tone = markerTone(day.marker);
  const tint = tone ? theme.dayCell[tone] : null;
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
          backgroundColor: tint ? tint.fill : theme.colors.surface,
          borderColor: tint ? tint.border : theme.colors.line,
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

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    fill: { flex: 1, aspectRatio: 1 },
    cell: {
      borderRadius: radius.sm,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    today: { borderWidth: 2, borderColor: t.colors.ember },
    date: { position: 'absolute', top: 2, left: 5 },
    // Emoji are content (the day marker), not an icon or a type size; leading keeps them centered.
    emoji: { lineHeight: 24, marginTop: 6 },
  }),
);
