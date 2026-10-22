/**
 * Track 38c - Badges: a count, an "Almost there" row, then every badge grouped by category. Tap
 * one for the large emblem, what it is for, and when (and in which workout) you earned it - or
 * how far along you are. Opening the screen marks what is earned as seen (the NEW dot on Journey).
 *
 * Never punish (invariant 4): locked badges show neutral progress ("12 of 25"), nothing is ever
 * removed, and there is no streak or expiry copy.
 */
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { badgesRepo } from '@roamfit/store';
import type { RootScreenProps } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { nowUtcInstant } from '../lib/localClock';
import { progressText, type ShelfBadge } from '../lib/badges';
import { formatFullLocalDate } from '../lib/sessionHistory';
import { useDashboardData } from '../lib/useDashboardData';
import { makeStyles, space } from '../theme';
import { Card, PressableScale, Screen, Sheet, Txt } from '../ui';
import { BadgeEmblem, TIER_ACCENT } from '../components/BadgeEmblem';

type Props = RootScreenProps<'Badges'>;

function nameOf(b: ShelfBadge): string {
  return b.mystery ? 'Hidden badge' : b.def.name;
}

export default function BadgesScreen(_props: Props): React.JSX.Element {
  const { db } = useStore();
  const styles = useStyles();
  const { data, reload } = useDashboardData();
  const [openId, setOpenId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const fresh = reload();
      // `fresh` still carries the unseen flags, so this visit shows the NEW dots; the next
      // visit (and Journey) will not.
      const unseen = fresh.badges.recent.filter((b) => b.unseen).map((b) => b.def.id);
      if (unseen.length > 0) badgesRepo.markBadgesSeen(db, unseen, nowUtcInstant());
    }, [db, reload]),
  );

  if (!data) return <Screen testID="badges-screen" />;
  const shelf = data.badges;
  const all = shelf.sections.flatMap((s) => s.badges);
  const open = openId ? (all.find((b) => b.def.id === openId) ?? null) : null;

  return (
    <Screen scroll testID="badges-screen" contentStyle={styles.content}>
      <View style={styles.head}>
        <Txt variant="h1" accessibilityRole="header">
          Badges
        </Txt>
        <Txt variant="body" color="text2" testID="badges-count">
          {shelf.earnedCount} of {shelf.totalCount} earned
        </Txt>
      </View>

      {shelf.almostThere.length > 0 ? (
        <View style={styles.section} testID="badges-almost">
          <Txt variant="eyebrow" color="text3" accessibilityRole="header">
            Almost there
          </Txt>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.almostRow}
          >
            {shelf.almostThere.map((b) => (
              <Card
                key={b.def.id}
                testID={`badges-almost-${b.def.id}`}
                padding="md"
                onPress={() => setOpenId(b.def.id)}
                accessibilityLabel={`${b.def.name}, ${progressText(b.progress!)}`}
                style={styles.almostCard}
              >
                <BadgeEmblem badge={b} size={40} showProgress />
                <View style={styles.almostText}>
                  <Txt variant="bodyStrong">{b.def.name}</Txt>
                  <Txt variant="small" color="text2">
                    {progressText(b.progress!)}
                  </Txt>
                </View>
              </Card>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {shelf.sections.map((section) => (
        <View
          key={section.category}
          style={styles.section}
          testID={`badges-section-${section.category}`}
        >
          <Txt variant="eyebrow" color="text3" accessibilityRole="header">
            {section.title}
          </Txt>
          <View style={styles.grid}>
            {section.badges.map((b) => (
              <PressableScale
                key={b.def.id}
                testID={`badge-${b.def.id}`}
                onPress={() => setOpenId(b.def.id)}
                accessibilityRole="button"
                accessibilityLabel={`${nameOf(b)}${b.earned ? ', earned' : b.progress && !b.mystery ? `, locked, ${progressText(b.progress)}` : ', locked'}`}
                style={styles.cell}
              >
                <BadgeEmblem
                  badge={b}
                  size={64}
                  showProgress
                  showNew={b.unseen}
                  testID={`badge-emblem-${b.def.id}`}
                />
                <Txt variant="small" align="center" color={b.earned ? 'text' : 'text3'}>
                  {nameOf(b)}
                </Txt>
              </PressableScale>
            ))}
          </View>
        </View>
      ))}

      <Sheet
        visible={open !== null}
        onClose={() => setOpenId(null)}
        title={open ? nameOf(open) : undefined}
        testID="badge-sheet"
      >
        {open ? (
          <View style={styles.sheetBody}>
            <View style={styles.sheetEmblem}>
              <BadgeEmblem badge={open} size={120} />
            </View>
            <Txt variant="body" color="text2" align="center">
              {open.mystery
                ? 'A hidden badge - keep training and it may turn up.'
                : open.def.description}
            </Txt>
            {open.earned ? (
              <View style={styles.sheetBody}>
                <Txt
                  variant="bodyStrong"
                  align="center"
                  color={TIER_ACCENT[open.def.tier]}
                  testID="badge-sheet-earned"
                >
                  {open.retroactive || !open.localDate
                    ? 'Earned'
                    : `Earned ${formatFullLocalDate(open.localDate)}`}
                </Txt>
              </View>
            ) : open.progress && !open.mystery ? (
              <Txt variant="bodyStrong" align="center" testID="badge-sheet-progress">
                {progressText(open.progress)}
              </Txt>
            ) : null}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    content: { paddingTop: space.lg, paddingBottom: space.huge + space.xxl, gap: space.xxl },
    head: { gap: space.xs },
    section: { gap: space.md },
    almostRow: { gap: space.md },
    almostCard: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    almostText: { gap: 2 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.lg },
    cell: { width: '33.33%', alignItems: 'center', gap: space.xs, paddingHorizontal: space.xs },
    sheetBody: { gap: space.md },
    sheetEmblem: { alignItems: 'center', paddingVertical: space.sm },
  }),
);
