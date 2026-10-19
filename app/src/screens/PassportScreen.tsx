/**
 * Track 39b - the Passport book. One page at a time inside a "book" frame: cover, bio, contents
 * (two or more countries), visa pages of stamps, and the travel-badge endorsements. 39c adds the page turn:
 * the screen owns `pageIndex`; `PassportBook` runs the page turn (components/PageTurnBook.tsx)
 * and `PassportPage` draws whichever page it is handed.
 *
 * Never punish (invariant 4): a stamp is a souvenir, an unfilled last page simply ends, and
 * nothing here reads as something missing or overdue. Dates are `local_date`s (invariant 6).
 */
import React, { useMemo, useState } from 'react';
import type { AccessibilityActionEvent } from 'react-native';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { RootScreenProps } from '../navigation/types';
import { progressText, type ShelfBadge } from '../lib/badges';
import { monthShortName, type PassportEntry } from '../lib/dashboard';
import { formatFullLocalDate } from '../lib/sessionHistory';
import { useDashboardData } from '../lib/useDashboardData';
import {
  bookPageForCountry,
  bookPageForLabel,
  buildPassportBook,
  type PassportBookPage,
} from '../lib/passportBook';
import { makeStyles, radius, space, useTheme } from '../theme';
import { IconButton, PressableScale, Screen, Sheet, Stamp, Txt } from '../ui';
import { BadgeEmblem } from '../components/BadgeEmblem';
import { EmptyState } from '../components/EmptyState';
import { PassportOptInCard } from '../components/PassportOptInCard';
import { PageTurnLayers, usePageTurn } from '../components/PageTurnBook';

type Props = RootScreenProps<'Passport'>;

/** `2026-09-03` -> `Sep 3, 2026`, from the parts of the `local_date` (invariant 6). */
function shortDate(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  if (!y || !m || !d) return localDate;
  return `${monthShortName(m)} ${d}, ${y}`;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Guilloche-style security lines: a few phase-shifted waves behind the page content. */
const GUILLOCHE_PATHS: string[] = Array.from({ length: 9 }, (_, k) => {
  const pts: string[] = [];
  for (let x = 0; x <= 100; x += 4) {
    const y = 14 + k * 14 + Math.sin((x / 100) * Math.PI * 4 + k * 0.7) * 5;
    pts.push(`${x === 0 ? 'M' : 'L'}${x} ${y.toFixed(2)}`);
  }
  return pts.join(' ');
});

function Guilloche(): React.JSX.Element {
  const theme = useTheme();
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      viewBox="0 0 100 140"
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      {GUILLOCHE_PATHS.map((d, i) => (
        <Path
          key={i}
          d={d}
          fill="none"
          stroke={theme.colors.line}
          strokeWidth={0.5}
          opacity={0.6}
        />
      ))}
    </Svg>
  );
}

export interface PassportPageProps {
  page: PassportBookPage;
  onOpenStamp: (entry: PassportEntry) => void;
  onSelectCountry: (country: string) => void;
  onOpenBadges: () => void;
}

/** Draws one page of the book. Stateless: the screen decides which page to hand it. */
export function PassportPage({
  page,
  onOpenStamp,
  onSelectCountry,
  onOpenBadges,
}: PassportPageProps): React.JSX.Element {
  const styles = useStyles();
  switch (page.kind) {
    case 'cover':
      return (
        <View style={styles.cover} testID="passport-page-cover">
          <Txt variant="eyebrow" color="gold" align="center" style={styles.embossSmall}>
            Wanderlift
          </Txt>
          <View style={styles.coverRule} />
          <Txt
            variant="display"
            color="gold"
            align="center"
            accessibilityLabel="Passport"
            style={styles.emboss}
          >
            PASSPORT
          </Txt>
          <View style={styles.coverRule} />
          <Txt variant="small" color="text2" align="center">
            Every place you have trained
          </Txt>
        </View>
      );
    case 'bio':
      return (
        <View style={styles.pageBody} testID="passport-page-bio">
          <Guilloche />
          <Txt variant="eyebrow" color="text3">
            Traveller
          </Txt>
          <Bio label="Training since">
            {page.trainingSince ? formatFullLocalDate(page.trainingSince) : '-'}
          </Bio>
          <Bio label="Places">{String(page.placeCount)}</Bio>
          <Bio label="Countries">{String(page.countryCount)}</Bio>
          {page.first ? (
            <Bio label="First stamp">{`${page.first.label} - ${formatFullLocalDate(page.first.firstLocalDate)}`}</Bio>
          ) : null}
          {page.latest ? (
            <Bio label="Most recent stamp">{`${page.latest.label} - ${formatFullLocalDate(page.latest.lastLocalDate)}`}</Bio>
          ) : null}
        </View>
      );
    case 'contents':
      return (
        <View style={styles.pageBody} testID="passport-page-contents">
          <Guilloche />
          <Txt variant="eyebrow" color="text3" accessibilityRole="header">
            Contents
          </Txt>
          {page.groups.map((g) => (
            <PressableScale
              key={g.country}
              testID={`passport-country-${g.country}`}
              accessibilityRole="button"
              accessibilityLabel={`${g.country}, ${g.placeCount} ${plural(g.placeCount, 'place', 'places')}. Go to its pages`}
              onPress={() => onSelectCountry(g.country)}
              style={styles.contentsRow}
            >
              <Txt variant="bodyStrong" style={styles.flex}>
                {g.country}
              </Txt>
              <Txt variant="small" color="text2">
                {g.placeCount} {plural(g.placeCount, 'place', 'places')}
              </Txt>
            </PressableScale>
          ))}
        </View>
      );
    case 'visa':
      return (
        <View style={styles.pageBody} testID={`passport-page-visa-${page.visaIndex}`}>
          <Guilloche />
          <Txt variant="eyebrow" color="text3" accessibilityRole="header">
            Visas
          </Txt>
          <View style={styles.stampGrid}>
            {page.entries.map((e) => (
              <PressableScale
                key={e.label}
                testID={`passport-stamp-${e.label}`}
                accessibilityRole="button"
                accessibilityLabel={`${e.label}, ${formatFullLocalDate(e.firstLocalDate)}. Show details`}
                onPress={() => onOpenStamp(e)}
                style={styles.stampCell}
              >
                <Stamp
                  testID={`passport-stamp-art-${e.label}`}
                  title={e.label}
                  seed={e.label}
                  size={84}
                />
                <Txt variant="caption" color="text2" align="center">
                  {shortDate(e.firstLocalDate)}
                </Txt>
              </PressableScale>
            ))}
          </View>
        </View>
      );
    case 'endorsements':
      return (
        <View style={styles.pageBody} testID="passport-page-endorsements">
          <Guilloche />
          <Txt variant="eyebrow" color="text3" accessibilityRole="header">
            Endorsements
          </Txt>
          <View style={styles.badgeList}>
            {page.badges.map((b) => (
              <EndorsementRow key={b.def.id} badge={b} onPress={onOpenBadges} />
            ))}
          </View>
        </View>
      );
  }
}

function Bio({ label, children }: { label: string; children: string }): React.JSX.Element {
  return (
    <View accessible accessibilityLabel={`${label}: ${children}`}>
      <Txt variant="caption" color="text3">
        {label}
      </Txt>
      <Txt variant="bodyStrong">{children}</Txt>
    </View>
  );
}

function EndorsementRow({
  badge,
  onPress,
}: {
  badge: ShelfBadge;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const progress = badge.earned ? 'Earned' : badge.progress ? progressText(badge.progress) : '';
  return (
    <PressableScale
      testID={`passport-badge-${badge.def.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${badge.def.name}${progress ? `, ${progress}` : ''}. See all badges`}
      onPress={onPress}
      style={styles.badgeRow}
    >
      <BadgeEmblem badge={badge} size={40} />
      <View style={styles.flex}>
        <Txt variant="bodyStrong">{badge.def.name}</Txt>
        {progress ? (
          <Txt variant="small" color="text2">
            {progress}
          </Txt>
        ) : null}
      </View>
    </PressableScale>
  );
}

interface PassportBookProps {
  pages: PassportBookPage[];
  index: number;
  onIndexChange: (i: number) => void;
  onOpenStamp: (entry: PassportEntry) => void;
  pageForCountry: (country: string) => number | null;
  onOpenBadges: () => void;
}

/** The book frame, the page turn (swipe included) and the prev/next + "Page N of M" bar. */
function PassportBook({
  pages,
  index,
  onIndexChange,
  onOpenStamp,
  pageForCountry,
  onOpenBadges,
}: PassportBookProps): React.JSX.Element {
  const styles = useStyles();
  const last = pages.length - 1;
  const pageTurn = usePageTurn({ index, last, onIndexChange });
  const { goTo } = pageTurn;
  // Screen readers adjust a single element, so the actions live on the "Page N of M" label (an
  // `adjustable`); the book itself must stay un-grouped so its stamps and rows remain reachable.
  const onAdjust = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment') goTo(index + 1);
    else if (e.nativeEvent.actionName === 'decrement') goTo(index - 1);
  };
  return (
    <>
      <View
        style={styles.book}
        testID="passport-book"
        onLayout={pageTurn.onLayout}
        {...pageTurn.panHandlers}
      >
        <View style={styles.spine} />
        <PageTurnLayers
          index={index}
          pageTurn={pageTurn}
          renderPage={(i) => (
            <PassportPage
              page={pages[i]!}
              onOpenStamp={onOpenStamp}
              onSelectCountry={(country) => {
                const t = pageForCountry(country);
                if (t !== null) goTo(t);
              }}
              onOpenBadges={onOpenBadges}
            />
          )}
        />
      </View>
      <View style={styles.nav}>
        <IconButton
          testID="passport-prev"
          icon="back"
          accessibilityLabel="Previous page"
          disabled={index <= 0}
          onPress={() => goTo(index - 1)}
        />
        <Txt
          variant="small"
          color="text2"
          testID="passport-page-label"
          accessibilityLiveRegion="polite"
          accessibilityRole="adjustable"
          accessibilityActions={[
            { name: 'increment', label: 'Next page' },
            { name: 'decrement', label: 'Previous page' },
          ]}
          onAccessibilityAction={onAdjust}
        >
          Page {index + 1} of {pages.length}
        </Txt>
        <IconButton
          testID="passport-next"
          icon="chevronRight"
          accessibilityLabel="Next page"
          disabled={index >= last}
          onPress={() => goTo(index + 1)}
        />
      </View>
    </>
  );
}

export default function PassportScreen({ navigation, route }: Props): React.JSX.Element {
  const styles = useStyles();
  const { data, reload } = useDashboardData();
  const stampLabel = route.params?.stampLabel;
  // null until the user pages; then the start page (a stamp's page, else the cover) applies.
  const [pageIndex, setPageIndex] = useState<number | null>(null);
  const [openEntry, setOpenEntry] = useState<PassportEntry | null>(null);

  const pages = useMemo(() => (data ? buildPassportBook(data.passport, data.badges) : []), [data]);

  if (!data) return <Screen testID="passport-screen" />;

  const startIndex = stampLabel ? (bookPageForLabel(data.passport, stampLabel) ?? 0) : 0;
  const last = Math.max(0, pages.length - 1);
  const index = Math.min(Math.max(pageIndex ?? startIndex, 0), last);

  const header = (
    <Txt variant="h1" accessibilityRole="header">
      Passport
    </Txt>
  );

  if (!data.user.passportEnabled) {
    return (
      <Screen scroll testID="passport-screen" contentStyle={styles.content}>
        {header}
        <PassportOptInCard testID="passport-opt-in-card" onEnabled={() => reload()} />
      </Screen>
    );
  }

  if (data.passport.places.length === 0) {
    return (
      <Screen scroll testID="passport-screen" contentStyle={styles.content}>
        {header}
        <EmptyState
          testID="passport-empty"
          icon="airplane"
          tone="sky"
          title="Passport is on"
          body="Train somewhere and your first stamp lands here."
        />
      </Screen>
    );
  }

  return (
    <Screen scroll testID="passport-screen" contentStyle={styles.content}>
      {header}
      <PassportBook
        pages={pages}
        index={index}
        onIndexChange={setPageIndex}
        onOpenStamp={setOpenEntry}
        pageForCountry={(country) => bookPageForCountry(data.passport, country)}
        onOpenBadges={() => navigation.navigate('Badges')}
      />

      <Sheet
        visible={openEntry !== null}
        onClose={() => setOpenEntry(null)}
        title={openEntry?.label}
        testID="passport-stamp-sheet"
      >
        {openEntry ? (
          <View style={styles.sheetBody}>
            <SheetRow label="First visit" value={formatFullLocalDate(openEntry.firstLocalDate)} />
            <SheetRow label="Last visit" value={formatFullLocalDate(openEntry.lastLocalDate)} />
            <SheetRow
              label="Workouts here"
              value={String(openEntry.sessionCount)}
              testID="passport-sheet-sessions"
            />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function SheetRow({
  label,
  value,
  testID,
}: {
  label: string;
  value: string;
  testID?: string;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.sheetRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Txt variant="body" color="text2">
        {label}
      </Txt>
      <Txt variant="bodyStrong" testID={testID}>
        {value}
      </Txt>
    </View>
  );
}

const PAGE_HEIGHT = 460;

const useStyles = makeStyles((theme) =>
  StyleSheet.create({
    content: { paddingTop: space.lg, paddingBottom: space.huge + space.xxl, gap: space.xl },
    flex: { flex: 1 },
    book: {
      minHeight: PAGE_HEIGHT,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.lineStrong,
      borderWidth: 1,
      borderRadius: radius.md,
      overflow: 'hidden',
      ...theme.elevation.card,
    },
    spine: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 8,
      backgroundColor: theme.colors.surface3,
    },
    cover: {
      flex: 1,
      minHeight: PAGE_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.xl,
      padding: space.xxl,
      backgroundColor: theme.colors.surface2,
    },
    coverRule: { width: 120, height: 2, backgroundColor: theme.colors.gold, opacity: 0.6 },
    emboss: {
      textShadowColor: theme.colors.bg,
      textShadowOffset: { width: 1, height: 2 },
      textShadowRadius: 1,
    },
    embossSmall: {
      textShadowColor: theme.colors.bg,
      textShadowOffset: { width: 1, height: 1 },
      textShadowRadius: 1,
    },
    pageBody: {
      flex: 1,
      minHeight: PAGE_HEIGHT,
      paddingVertical: space.xl,
      paddingLeft: space.xl + 8,
      paddingRight: space.xl,
      gap: space.lg,
    },
    contentsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      minHeight: 44,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.line,
    },
    stampGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.lg },
    stampCell: { width: '50%', alignItems: 'center', gap: space.xs, paddingVertical: space.xs },
    badgeList: { gap: space.lg },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
    nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sheetBody: { gap: space.md },
    sheetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  }),
);
