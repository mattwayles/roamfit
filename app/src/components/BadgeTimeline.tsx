/**
 * Track 44d - the Badges "Timeline" view: earned badges by the month they were earned in, newest
 * first. Each entry is an emblem, name, date and the workout it came from; tapping opens the
 * badge sheet, and the workout line goes to that finished workout.
 *
 * Never punish (invariant 4): only what is earned appears; badges found in your history sit in
 * their own group, worded as a find.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { makeStyles, space } from '../theme';
import { Icon, PressableScale, Txt } from '../ui';
import { formatFullLocalDate } from '../lib/sessionHistory';
import { earnedDuringLabel, type ShelfBadge, type TimelineGroup } from '../lib/badges';
import { useEarnedDuring } from '../lib/useEarnedDuring';
import { BadgeEmblem } from './BadgeEmblem';

function Entry({
  badge,
  onOpenBadge,
  onOpenSession,
}: {
  badge: ShelfBadge;
  onOpenBadge: (b: ShelfBadge) => void;
  onOpenSession: (sessionId: string) => void;
}): React.JSX.Element {
  const styles = useStyles();
  const view = useEarnedDuring(badge);
  const date = badge.localDate && !badge.retroactive ? formatFullLocalDate(badge.localDate) : null;
  return (
    <View style={styles.entry} testID={`timeline-entry-${badge.def.id}`}>
      <PressableScale
        testID={`timeline-badge-${badge.def.id}`}
        onPress={() => onOpenBadge(badge)}
        accessibilityRole="button"
        accessibilityLabel={`${badge.def.name}${date ? `, earned ${date}` : ', earned'}`}
        style={styles.main}
      >
        <BadgeEmblem badge={badge} size={44} />
        <View style={styles.text}>
          <Txt variant="bodyStrong">{badge.def.name}</Txt>
          {date ? (
            <Txt variant="small" color="text2">
              {date}
            </Txt>
          ) : null}
        </View>
      </PressableScale>
      {view ? (
        <PressableScale
          testID={`timeline-session-${badge.def.id}`}
          onPress={() => onOpenSession(view.sessionId)}
          accessibilityRole="link"
          accessibilityLabel={`Earned during ${earnedDuringLabel(view)}`}
          style={styles.session}
        >
          <Txt variant="small" color="text3" style={styles.sessionText}>
            {earnedDuringLabel(view)}
          </Txt>
          <Icon name="chevronRight" size={16} color="text3" />
        </PressableScale>
      ) : null}
    </View>
  );
}

export function BadgeTimeline({
  groups,
  onOpenBadge,
  onOpenSession,
}: {
  groups: readonly TimelineGroup[];
  onOpenBadge: (b: ShelfBadge) => void;
  onOpenSession: (sessionId: string) => void;
}): React.JSX.Element {
  const styles = useStyles();
  if (groups.length === 0) {
    return (
      <View style={styles.empty} testID="badge-timeline-empty">
        <Txt variant="bodyStrong" align="center">
          Your timeline starts with your first badge
        </Txt>
        <Txt variant="small" color="text2" align="center">
          Finish a workout and it lands here, with the day you earned it.
        </Txt>
      </View>
    );
  }
  return (
    <View style={styles.list} testID="badge-timeline">
      {groups.map((g) => (
        <View key={g.key} style={styles.group} testID={`timeline-group-${g.key}`}>
          <Txt variant="eyebrow" color="text3" accessibilityRole="header">
            {g.title}
          </Txt>
          {g.badges.map((b) => (
            <Entry
              key={b.def.id}
              badge={b}
              onOpenBadge={onOpenBadge}
              onOpenSession={onOpenSession}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    list: { gap: space.xl },
    group: { gap: space.md },
    entry: { gap: space.xs },
    main: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    text: { flex: 1, gap: 2 },
    session: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      paddingLeft: 44 + space.md,
    },
    sessionText: { flex: 1 },
    empty: { gap: space.xs, paddingVertical: space.xl, paddingHorizontal: space.lg },
  }),
);
