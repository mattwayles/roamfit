/**
 * The Trails "rung track" (DESIGN.md §5.2): one node per level on a horizontal line. Levels
 * below the current one are filled sky, the current one is larger and glows, levels above are
 * hollow, and the top node is a flag (the summit). At mastery the whole track turns gold and the
 * current node is the flag. Purely a picture of `level n of N` — the words live beside it.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { makeStyles, useTheme } from '../theme';
import { Icon } from '../ui';

export interface RungTrackProps {
  /** Number of levels on the ladder. */
  count: number;
  /** Current level, 1-based. */
  current: number;
  mastery?: boolean;
  testID?: string;
}

const SMALL = 12;
const BIG = 24;

export function RungTrack({
  count,
  current,
  mastery = false,
  testID = 'rung-track',
}: RungTrackProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  const { colors } = theme;
  const total = Math.max(1, count);
  const at = Math.min(Math.max(current, 1), total);
  const accent = mastery ? colors.gold : colors.sky;

  const items: React.ReactNode[] = [];
  for (let i = 0; i < total; i += 1) {
    const level = i + 1;
    const isCurrent = level === at;
    const isTop = level === total;
    const passed = level < at;

    if (i > 0) {
      // The segment leading into this node is "done" once this node has been reached.
      items.push(
        <View
          key={`seg-${i}`}
          testID={`${testID}-seg-${i}`}
          style={[styles.segment, { backgroundColor: level <= at ? accent : colors.line }]}
        />,
      );
    }

    if (isCurrent) {
      items.push(
        <View
          key={`n-${i}`}
          testID={`${testID}-node-${i}`}
          style={[styles.big, { backgroundColor: accent }, theme.glow(accent)]}
        >
          {isTop ? <Icon name="flag" size={14} color="ink" /> : null}
        </View>,
      );
    } else if (isTop) {
      items.push(
        <View key={`n-${i}`} testID={`${testID}-node-${i}`} style={styles.flag}>
          <Icon name="flag" size={12} color="text3" />
        </View>,
      );
    } else {
      items.push(
        <View
          key={`n-${i}`}
          testID={`${testID}-node-${i}`}
          style={[
            styles.small,
            passed ? { backgroundColor: accent, borderColor: accent } : styles.hollow,
          ]}
        />,
      );
    }
  }

  return (
    <View testID={testID} style={styles.row}>
      {items}
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', minHeight: BIG + 4 },
    segment: { flex: 1, height: 2, borderRadius: 1, minWidth: 4 },
    small: { width: SMALL, height: SMALL, borderRadius: SMALL / 2, borderWidth: 2 },
    hollow: { backgroundColor: t.colors.surface2, borderColor: t.colors.lineStrong },
    big: {
      width: BIG,
      height: BIG,
      borderRadius: BIG / 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    flag: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: t.colors.surface2,
      borderWidth: 1,
      borderColor: t.colors.lineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }),
);
