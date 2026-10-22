/**
 * Track 38c/44b - Badges: a hero (newest badge, category patches, tier tally), an "Almost there"
 * row, then per category the multi-tier series as trail rows and the one-off badges as a compact
 * "Singles" grid. A trail row opens a sheet with every tier; tap a badge for the large emblem, what it is for, and when (and in which workout) you earned it - or
 * how far along you are. Opening the screen marks what is earned as seen (the NEW dot on Journey).
 *
 * Never punish (invariant 4): locked badges show neutral progress ("12 of 25"), nothing is ever
 * removed, and there is no streak or expiry copy.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { BadgeCategory } from '@roamfit/engine';
import { useFocusEffect } from '@react-navigation/native';
import { badgesRepo, sessionsRepo } from '@roamfit/store';
import type { RootScreenProps } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { nowUtcInstant } from '../lib/localClock';
import {
  badgeShareText,
  buildSeriesTrails,
  earnedDuringLabel,
  progressText,
  seriesContext,
  tierTally,
  type ShelfBadge,
} from '../lib/badges';
import { buildSessionHistoryView, formatFullLocalDate } from '../lib/sessionHistory';
import { useDashboardData } from '../lib/useDashboardData';
import { makeStyles, space } from '../theme';
import { Button, Card, Icon, IconButton, Pips, PressableScale, Screen, Sheet, Txt } from '../ui';
import { BadgeEmblem, TIER_ACCENT } from '../components/BadgeEmblem';
import { BadgeSeriesList, BadgeTrail } from '../components/BadgeTrail';
import { BadgesHero } from '../components/BadgesHero';

type Props = RootScreenProps<'Badges'>;

function nameOf(b: ShelfBadge): string {
  return b.mystery ? 'Hidden badge' : b.def.name;
}

/** "Earned during <date · focus · minutes>", a link to the read-only finished-workout page. Only
 *  for a badge earned in a session (a retroactive one has none) whose workout is still on file. */
function EarnedDuring({
  badge,
  onOpen,
}: {
  badge: ShelfBadge;
  onOpen: (sessionId: string) => void;
}): React.JSX.Element | null {
  const { db, library } = useStore();
  const styles = useStyles();
  const sessionId = badge.earned && !badge.retroactive ? badge.sessionId : null;
  const view = useMemo(() => {
    if (!sessionId) return null;
    const session = sessionsRepo.getCompletedSessionDetail(db, sessionId);
    return session ? buildSessionHistoryView(session, library.exercises) : null;
  }, [db, library, sessionId]);
  if (!view) return null;
  return (
    <PressableScale
      testID="badge-sheet-session"
      onPress={() => onOpen(view.sessionId)}
      accessibilityRole="link"
      accessibilityLabel={`Earned during ${earnedDuringLabel(view)}`}
      style={styles.duringRow}
    >
      <View style={styles.duringText}>
        <Txt variant="eyebrow" color="text3">
          Earned during
        </Txt>
        <Txt variant="bodyStrong">{earnedDuringLabel(view)}</Txt>
      </View>
      <Icon name="chevronRight" size={18} color="text3" />
    </PressableScale>
  );
}

export default function BadgesScreen({ navigation }: Props): React.JSX.Element {
  const { db } = useStore();
  const styles = useStyles();
  const { data, reload } = useDashboardData();
  const [openId, setOpenId] = useState<string | null>(null);
  const [trailSeries, setTrailSeries] = useState<string | null>(null);
  const { height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Partial<Record<BadgeCategory, number>>>({});
  const trailSections = useMemo(
    () => (data ? buildSeriesTrails(data.badges.sections) : []),
    [data],
  );

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
  const series = open ? seriesContext(all, open) : null;
  const openTrail = trailSeries
    ? (trailSections.flatMap((t) => t.trails).find((t) => t.series === trailSeries) ?? null)
    : null;

  return (
    <Screen scroll scrollRef={scrollRef} testID="badges-screen" contentStyle={styles.content}>
      <View style={styles.head}>
        <Txt variant="h1" accessibilityRole="header">
          Badges
        </Txt>
      </View>

      <BadgesHero
        earnedCount={shelf.earnedCount}
        totalCount={shelf.totalCount}
        latest={shelf.recent[0] ?? null}
        next={shelf.next}
        sections={trailSections}
        tally={tierTally(shelf)}
        onOpenBadge={(b) => setOpenId(b.def.id)}
        onJump={(category) => {
          const y = sectionY.current[category];
          if (y !== undefined)
            scrollRef.current?.scrollTo({ y: Math.max(0, y - space.lg), animated: true });
        }}
      />

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

      {trailSections.map((section) => (
        <View
          key={section.category}
          style={styles.section}
          testID={`badges-section-${section.category}`}
          onLayout={(e) => {
            sectionY.current[section.category] = e.nativeEvent.layout.y;
          }}
        >
          <Txt variant="eyebrow" color="text3" accessibilityRole="header">
            {section.title}
          </Txt>
          {section.trails.map((trail) => (
            <BadgeTrail
              key={trail.series}
              trail={trail}
              onPress={() => setTrailSeries(trail.series)}
            />
          ))}
          {section.singles.length > 0 ? (
            <View style={styles.singles} testID={`badges-singles-${section.category}`}>
              {section.trails.length > 0 ? (
                <Txt variant="small" color="text3" accessibilityRole="header">
                  Singles
                </Txt>
              ) : null}
              <View style={styles.grid}>
                {section.singles.map((b) => (
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
          ) : null}
        </View>
      ))}

      {/* One sheet for both views (a second Modal presented while the first dismisses can be
          dropped on iOS): a badge, or - from a trail row - the series with every tier. */}
      <Sheet
        visible={open !== null || openTrail !== null}
        onClose={() => {
          setOpenId(null);
          setTrailSeries(null);
        }}
        title={open ? nameOf(open) : openTrail?.title}
        testID="badge-sheet"
      >
        {!open && openTrail ? (
          <View style={styles.sheetBody} testID="trail-sheet">
            <Txt variant="small" color="text2" testID="trail-sheet-summary">
              {openTrail.current
                ? `${openTrail.earnedCount} of ${openTrail.nodes.length} earned`
                : openTrail.subtitle}
            </Txt>
            <ScrollView style={{ maxHeight: height * 0.6 }} showsVerticalScrollIndicator={false}>
              <BadgeSeriesList trail={openTrail} onSelect={(b) => setOpenId(b.def.id)} />
            </ScrollView>
          </View>
        ) : null}
        {open ? (
          <View style={styles.sheetBody}>
            <View style={styles.sheetEmblemRow}>
              {series ? (
                <IconButton
                  testID="badge-sheet-prev"
                  icon="back"
                  size="md"
                  accessibilityLabel="Previous badge in this series"
                  disabled={!series.prev}
                  onPress={() => series.prev && setOpenId(series.prev.def.id)}
                />
              ) : null}
              <View style={styles.sheetEmblem}>
                <BadgeEmblem badge={open} size={120} showProgress />
              </View>
              {series ? (
                <IconButton
                  testID="badge-sheet-next"
                  icon="chevronRight"
                  size="md"
                  accessibilityLabel="Next badge in this series"
                  disabled={!series.next}
                  onPress={() => series.next && setOpenId(series.next.def.id)}
                />
              ) : null}
            </View>
            <Txt variant="body" color="text2" align="center">
              {open.mystery
                ? 'A hidden badge - keep training and it may turn up.'
                : open.def.description}
            </Txt>
            {series && !open.mystery ? (
              <View style={styles.seriesInfo}>
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Pips
                    testID="badge-sheet-pips"
                    count={series.total}
                    filled={series.earned}
                    current={series.index}
                    size={10}
                  />
                </View>
                <Txt variant="small" color="text2" testID="badge-sheet-series">
                  {series.label}
                </Txt>
              </View>
            ) : null}
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
                <EarnedDuring
                  badge={open}
                  onOpen={(sessionId) => {
                    setOpenId(null);
                    navigation.navigate('SessionHistory', { sessionId });
                  }}
                />
                <Button
                  testID="badge-sheet-share"
                  label="Share"
                  icon="share"
                  variant="secondary"
                  size="md"
                  fullWidth
                  onPress={() => {
                    // Text only; opens the native share sheet and never posts anything itself.
                    void Share.share({ message: badgeShareText(open.def) });
                  }}
                />
              </View>
            ) : open.progress && !open.mystery ? (
              <View style={styles.sheetBody}>
                <Txt variant="bodyStrong" align="center" testID="badge-sheet-progress">
                  {progressText(open.progress)}
                </Txt>
                {open.def.hint ? (
                  <Txt variant="small" color="text2" align="center" testID="badge-sheet-hint">
                    {open.def.hint}
                  </Txt>
                ) : null}
              </View>
            ) : null}
            {trailSeries ? (
              <Button
                testID="badge-sheet-back-series"
                label="All in this series"
                variant="secondary"
                size="md"
                fullWidth
                onPress={() => setOpenId(null)}
              />
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
    singles: { gap: space.sm, marginTop: space.sm },
    almostRow: { gap: space.md },
    almostCard: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    almostText: { gap: 2 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.lg },
    cell: { width: '33.33%', alignItems: 'center', gap: space.xs, paddingHorizontal: space.xs },
    sheetBody: { gap: space.md },
    sheetEmblem: { alignItems: 'center', paddingVertical: space.sm },
    sheetEmblemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    seriesInfo: { alignItems: 'center', gap: space.xs },
    duringRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    duringText: { flex: 1, gap: 2 },
  }),
);
