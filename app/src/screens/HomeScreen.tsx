/**
 * §10.1 Home, now the **Today** tab (DESIGN.md §5.1): wordmark + greeting + Settings, banners,
 * the trail hero card (resumable session or "ready to move?"), Quick Session and In transit
 * tiles, a "This week" strip and the Next Unlock card. The long-term half of the old Home
 * (lifetime totals, progression board, calendar, passport, muscle balance) lives on the Journey
 * tab (`JourneyScreen`); both read through `useDashboardData`.
 *
 * §14.2 zero-session requirement: the Next Unlock card must render before the user has ever
 * generated a session — `useDashboardData` runs `ensureProgressionStatesInitialized` (idempotent
 * store call, not new persistence logic) so a fresh install has starting-level progression rows
 * to show without waiting for a first generation.
 *
 * Governing rule (§14, §1.1): every element accumulates monotonically or points at a concrete
 * next action. No daily streaks, no red/empty styling on untrained days, no guilt copy and no
 * "0 this week" style counts anywhere on this screen — see the wave brief's "grep for shame"
 * done-criterion. The week strip shows markers only, never a tally of what didn't happen.
 *
 * All state comes from `@roamfit/store` repositories and `@roamfit/engine` pure functions; the
 * only "decision" made in this file is which screen to route to and how to lay data out, never
 * what to generate, prescribe, or flag as over-worked (that's `dashboard.ts` calling straight
 * into the engine).
 */
import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { generate, sessionsRepo, statsRepo, usersRepo } from '@roamfit/store';
import { createRng, seedFromString } from '@roamfit/engine';
import { pickQuickSessionDifficulty, pickQuickSessionFocus } from '../lib/quickSession';
import type { TabScreenProps } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import { findCurrentEntry, sessionCompletionFraction } from '../lib/sessionProgress';
import { greetingFor } from '../lib/hypeCopy';
import AbandonSessionButton from '../components/AbandonSessionButton';
import { DISCLAIMER_TEXT } from './SettingsScreen';
import { nextUnlockHero, WEEKDAY_LABELS } from '../lib/dashboard';
import { markerLabel } from '../lib/dayMarkers';
import { useDashboardData } from '../lib/useDashboardData';
import {
  ensureNotificationPermission,
  scheduleMotivationNotifications,
} from '../lib/motivationNotifications';
import { runOpportunisticSync } from '../lib/opportunisticSync';
import { makeStyles, radius, space, useTheme, withAlpha, type AccentName } from '../theme';
import {
  Button,
  Card,
  Chip,
  Enter,
  Icon,
  IconButton,
  PressableScale,
  ProgressRing,
  Screen,
  SectionHeader,
  TopoPattern,
  Txt,
  type IconName,
} from '../ui';
import { DayCell } from '../components/DayCell';
import { IconBadge } from '../components/IconBadge';

type Props = TabScreenProps<'Home'>;

export default function HomeScreen({ navigation }: Props): React.JSX.Element {
  const { db, library, families } = useStore();
  const theme = useTheme();
  const styles = useStyles();
  const pillTone = theme.heroCta;
  const { data, reload } = useDashboardData();
  const [startingQuick, setStartingQuick] = useState(false);
  const [travelDismissed, setTravelDismissed] = useState(false);

  const load = useCallback(() => {
    const fresh = reload();
    const { user, stats, board } = fresh;
    const todayLocalDate = fresh.todayLocalDate;

    // Daily motivation pool — re-derive the rolling schedule on every Home open (cheap,
    // idempotent by fixed identifier; same opportunistic-refresh pattern as `runOpportunisticSync`
    // below). This is also what makes "skip today once a workout's done or it's a travel day"
    // take effect promptly: both the travel button and finishing a session route back to Home,
    // which re-runs `load()`. Gated on `hasEverCompletedSession` — a fresh install with nothing to
    // be adaptive about yet shouldn't be prompted for notification permission or nagged at all,
    // consistent with §1.1's "never punish/never pressure" register extended to onboarding.
    if (user.hasEverCompletedSession) {
      const alreadyCompletedToday = stats.lastSessionLocalDate === todayLocalDate;
      const isTravelDayToday = fresh.isTravelDayToday;
      void ensureNotificationPermission().then(() =>
        scheduleMotivationNotifications({
          motivationEnabled: user.notificationPrefs.motivationEnabled ?? true,
          motivationTimes: user.notificationPrefs.motivationTimes ?? ['18:00'],
          quietHoursEnabled: user.notificationPrefs.quietHoursEnabled ?? true,
          motivationContext: { hero: nextUnlockHero(board), weekStreak: stats.weekStreak },
          todayLocalDate,
          skipToday: alreadyCompletedToday || isTravelDayToday,
        }),
      );
    }
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      load();
      setTravelDismissed(false);
      // §11.3 — fire-and-forget. Never awaited by render, never blocks Home from showing local
      // data first (invariant 1); reloads afterward only so an applied change (a resolved
      // geocode, a curated video id) shows up without the user having to background/foreground
      // the app again.
      // `.catch` is not decoration: without it a rejection here (from the sync itself, or from
      // the `load` that follows it) becomes an unhandled promise rejection with nothing absorbing
      // it. Invariant 1 says the network layer can never affect the core loop — that has to hold
      // even when the fire-and-forget chain itself fails. See HomeScreen.syncIsolation.test.tsx.
      void runOpportunisticSync(db, nowUtcInstant())
        .then(load)
        .catch(() => {
          /* Home already rendered from local SQLite; a failed background sync changes nothing. */
        });
    }, [db, load]),
  );

  const hero = useMemo(() => (data ? nextUnlockHero(data.board) : null), [data]);
  const greeting = useMemo(() => greetingFor(new Date()), [data]);

  // §13.3 — the first-launch disclaimer is blocking. While it is up, take the tab bar away too so
  // nothing else in the app is reachable behind it (`TabBar` honors `tabBarStyle.display`).
  const gateUp = data !== undefined && !data.user.hasAcknowledgedDisclaimer;
  useLayoutEffect(() => {
    navigation.setOptions({ tabBarStyle: gateUp ? { display: 'none' } : undefined });
  }, [navigation, gateUp]);

  const handleQuickSession = useCallback(() => {
    setStartingQuick(true);
    try {
      const clock = nowEngineClock();
      const utcInstant = nowUtcInstant();
      const history = sessionsRepo.getHistoryForGeneration(db);
      const focus = pickQuickSessionFocus(history);
      const difficulty = pickQuickSessionDifficulty(history, focus);
      const { plan, comebackTier, recoveryWeekManual } = generate(db, {
        library,
        families,
        request: { focus, difficulty, targetMinutes: 15, quickSession: true },
        clock,
        rng: createRng(seedFromString(utcInstant)),
        utcInstant,
      });
      const sessionId = sessionsRepo.createPendingSession(db, {
        plan,
        utcInstant,
        localDate: clock.today,
        tzId: clock.tzId,
        comebackTier,
        recoveryWeekManual,
      });
      sessionsRepo.startSession(db, sessionId, nowUtcInstant());
      navigation.navigate('Workout', { sessionId });
    } finally {
      setStartingQuick(false);
    }
  }, [db, library, families, navigation]);

  /** §10.10 abandon (real device-testing request) — discards the pending session entirely via
   *  the existing `discardSession` (never a parallel path) and routes to Generate **with the
   *  pickers**, never a re-run of the discarded plan. Computes the exact (entry, setIndex) the
   *  user was on, if any, for the §8.3 "abandoned, and at exactly which exercise" signal — a
   *  `planned` (not-yet-started) session has nothing to compute, which `findCurrentEntry`
   *  already handles by returning `null`. */
  const handleAbandonPending = useCallback(() => {
    if (!data?.pending) return;
    const current = findCurrentEntry(data.pending);
    sessionsRepo.discardSession(
      db,
      data.pending.id,
      { abandonedEntryId: current?.entry.id, abandonedSetIndex: current?.setIndex },
      nowUtcInstant(),
    );
    navigation.navigate('Generate');
  }, [data, db, navigation]);

  const handleTravelDay = useCallback(() => {
    statsRepo.recordTravelDay(db, nowUtcInstant(), nowEngineClock().today);
    load();
  }, [db, load]);

  const handleRecoveryWeekAccept = useCallback(() => {
    navigation.navigate('Generate', { recoveryWeek: true });
  }, [navigation]);

  if (data === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.colors.teal} />
      </View>
    );
  }

  const { pending, stats, user, board, comebackTier, weekDays: week, todayLocalDate } = data;
  const suggestRecoveryWeek = statsRepo.shouldSuggestRecoveryWeek(stats);

  // §13.3 — the medical disclaimer must be shown on first launch, blocking, before any other
  // screen content. `hasAcknowledgedDisclaimer` is a one-way flag (usersRepo.acknowledgeDisclaimer)
  // so this only ever fires once per install; the permanent copy lives in Settings (issue #20/#37's
  // sibling gap — there was no settings screen at all before this wave).
  if (!user.hasAcknowledgedDisclaimer) {
    return (
      <View style={styles.gate} testID="disclaimer-gate">
        <TopoPattern seed="roamfit-gate" strength={0.6} />
        <Screen
          scroll
          edges={['top', 'left', 'right', 'bottom']}
          contentStyle={styles.gateContent}
          style={styles.gateScreen}
        >
          <Enter index={0}>
            <Txt variant="hero" color="teal" style={styles.wordmark}>
              ROAMFIT
            </Txt>
            <Txt variant="eyebrow" color="gold">
              Train anywhere.
            </Txt>
          </Enter>
          <Enter index={1}>
            <Card>
              <Txt variant="body" color="text2" testID="disclaimer-gate-text">
                {DISCLAIMER_TEXT}
              </Txt>
            </Card>
          </Enter>
          <Enter index={2}>
            <Button
              testID="disclaimer-acknowledge"
              label="I understand"
              size="lg"
              haptic="medium"
              onPress={() => {
                usersRepo.acknowledgeDisclaimer(db, nowUtcInstant());
                load();
              }}
            />
          </Enter>
        </Screen>
      </View>
    );
  }

  let stagger = 0;
  const next = () => stagger++;

  return (
    <Screen
      scroll
      edges={['top', 'left', 'right']}
      safeBottom={false}
      testID="today-screen"
      contentStyle={styles.content}
    >
      <Enter index={next()} style={styles.header}>
        <View style={styles.headerText}>
          <Txt variant="h1" color="teal">
            RoamFit
          </Txt>
          <Txt variant="small" color="text2" testID="today-greeting">
            {greeting}
          </Txt>
        </View>
        <IconButton
          testID="open-settings"
          icon="settings"
          accessibilityLabel="Settings"
          onPress={() => navigation.navigate('Settings')}
        />
      </Enter>

      {comebackTier !== 'none' && (
        <Enter index={next()}>
          <BannerCard
            testID="comeback-banner"
            icon="sparkles"
            tone="periwinkle"
            title="Welcome back — let's ease in."
          />
        </Enter>
      )}

      {data.recentTzChangeToday && !travelDismissed && (
        <Enter index={next()}>
          <BannerCard
            testID="travel-suggest-banner"
            icon="airplane"
            tone="sky"
            title="Looks like you traveled."
          >
            <View style={styles.bannerActions}>
              <Button
                testID="travel-suggest-accept"
                label="Mark today as a travel day"
                size="sm"
                variant="secondary"
                onPress={() => {
                  handleTravelDay();
                  setTravelDismissed(true);
                }}
              />
              <Button
                testID="travel-suggest-dismiss"
                label="Not this time"
                size="sm"
                variant="quiet"
                onPress={() => setTravelDismissed(true)}
              />
            </View>
          </BannerCard>
        </Enter>
      )}

      {suggestRecoveryWeek && (
        <Enter index={next()}>
          <BannerCard
            testID="recovery-week-banner"
            icon="leaf"
            tone="periwinkle"
            title="Recovery week — lighter loads, same consistency."
            subtitle="Tap to build one today"
            onPress={handleRecoveryWeekAccept}
          />
        </Enter>
      )}

      <Enter index={next()}>
        {pending ? (
          <>
            <Card
              testID="resume-card"
              variant="hero"
              seed={pending.id}
              style={styles.hero}
              onPress={() =>
                navigation.navigate(pending.status === 'active' ? 'Workout' : 'Approval', {
                  sessionId: pending.id,
                })
              }
            >
              <View style={styles.heroTop}>
                <Txt variant="eyebrow" color="ink">
                  {pending.status === 'active' ? 'Resume' : 'Ready to start'}
                </Txt>
                <Txt variant="display" color="ink" numberOfLines={2} adjustsFontSizeToFit>
                  {pending.focus} · {pending.targetMinutes} min
                </Txt>
                <Chip label={pending.difficulty} size="sm" />
              </View>
              <View style={styles.heroBottom}>
                {pending.status === 'active' ? (
                  <ResumeProgress fraction={sessionCompletionFraction(pending)} />
                ) : null}
                <Txt variant="small" color="ink">
                  {pending.status === 'active'
                    ? 'In progress — tap to continue'
                    : 'Ready to approve'}
                </Txt>
              </View>
            </Card>
            <AbandonSessionButton
              onConfirm={handleAbandonPending}
              label="Abandon and start fresh"
            />
          </>
        ) : (
          <Card
            testID="today-card"
            variant="hero"
            seed="today"
            style={styles.hero}
            onPress={() => navigation.navigate('Generate')}
          >
            <View style={styles.heroTop}>
              <Txt variant="eyebrow" color="ink">
                Today
              </Txt>
              <Txt variant="display" color="ink">
                Ready to move?
              </Txt>
              <Txt variant="small" color="ink">
                Pick your time, focus and gear — we&apos;ll build the rest.
              </Txt>
            </View>
            <View style={styles.heroPill}>
              <Txt variant="button" color={pillTone}>
                Build a session
              </Txt>
              <Icon name="arrowRight" size={20} color={pillTone} />
            </View>
          </Card>
        )}
      </Enter>

      <Enter index={next()} style={styles.tiles}>
        <ActionTile
          testID="quick-session-button"
          icon="bolt"
          tone="gold"
          title="Quick session"
          subtitle="7 min · zero decisions"
          loading={startingQuick}
          disabled={startingQuick || !!pending}
          onPress={handleQuickSession}
        />
        <ActionTile
          testID="travel-day-button"
          icon="airplane"
          tone="sky"
          title="In transit"
          subtitle={
            data.isTravelDayToday ? "Today's marked. Safe travels." : 'Mark today as travel'
          }
          onPress={handleTravelDay}
        />
      </Enter>

      {/* The strip is a window onto the Logbook: same markers, same tints (`DayCell`), derived from
          `buildCalendarDays` over `weekWindow` (always the 7 real days, neighbouring month included;
          all calendar math stays on `local_date`, invariant 6). Markers only — never a count of
          days without a workout (invariant 4). */}
      {week.length > 0 && (
        <Enter index={next()} style={styles.weekBlock}>
          <SectionHeader
            title="This week"
            icon="today"
            actionLabel="Open Journey"
            onAction={() => navigation.navigate('Journey')}
            testID="week-header"
          />
          <View testID="week-strip" style={styles.weekRow}>
            {week.map((day, i) => (
              <View key={day.localDate} style={styles.weekDay}>
                <Txt variant="caption" color="text3">
                  {WEEKDAY_LABELS[i]}
                </Txt>
                <DayCell
                  day={day}
                  size={40}
                  isToday={day.localDate === todayLocalDate}
                  testID={`week-day-${day.localDate}`}
                  accessibilityLabel={`${markerLabel(day.marker)} — open Journey`}
                  onPress={() => navigation.navigate('Journey')}
                />
              </View>
            ))}
          </View>
        </Enter>
      )}

      {hero ? (
        <Enter index={next()}>
          <Card
            testID="next-unlock-hero"
            padding="md"
            onPress={() => navigation.navigate('Journey')}
            style={styles.unlock}
          >
            <ProgressRing
              testID="next-unlock-ring"
              progress={hero.progress}
              size={64}
              stroke={7}
              accessibilityLabel={`${hero.sessionsRemaining} ${hero.sessionsRemaining === 1 ? 'session' : 'sessions'} to your next level`}
            >
              <Txt variant="h2">{hero.sessionsRemaining}</Txt>
            </ProgressRing>
            <View style={styles.unlockText}>
              <Txt variant="eyebrow" color="summit">
                Next unlock
              </Txt>
              {/* Names the movement function ("Horizontal Push"), not an exercise. Not the one
                  being unlocked (ADR 0014 — that is the reveal), and not the current one either:
                  the current exercise is precisely what the unlock replaces, so headlining it
                  dates the copy the moment the unlock lands. The pattern is true either side of
                  the rung change, and titles the Trail on Journey, so hero and trail read as one
                  subject. */}
              <Txt variant="h2">{hero.familyName}</Txt>
              <Txt variant="small" color="text2">
                {hero.sessionsRemaining} {hero.sessionsRemaining === 1 ? 'session' : 'sessions'} to
                your next level
              </Txt>
            </View>
            <Icon name="chevronRight" size={20} color="text3" />
          </Card>
        </Enter>
      ) : (
        board.length > 0 && (
          <Enter index={next()}>
            <Card
              testID="next-unlock-hero"
              padding="md"
              onPress={() => navigation.navigate('Journey')}
              style={styles.unlock}
            >
              <IconBadge icon="trophy" tone="gold" size={64} />
              <View style={styles.unlockText}>
                <Txt variant="eyebrow" color="gold">
                  Next unlock
                </Txt>
                <Txt variant="small" color="text2">
                  Every family is at Mastery — keep chasing best sets on your Trails.
                </Txt>
              </View>
              <Icon name="chevronRight" size={20} color="text3" />
            </Card>
          </Enter>
        )
      )}
    </Screen>
  );
}

/** Banner as an icon card: a tinted icon circle, the same copy, an optional action row. */
function BannerCard({
  testID,
  icon,
  tone,
  title,
  subtitle,
  onPress,
  children,
}: {
  testID: string;
  icon: IconName;
  tone: AccentName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  children?: React.ReactNode;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <Card testID={testID} padding="md" onPress={onPress} style={styles.banner}>
      <IconBadge icon={icon} tone={tone} />
      <View style={styles.bannerText}>
        <Txt variant="bodyStrong">{title}</Txt>
        {subtitle ? (
          <Txt variant="small" color={tone}>
            {subtitle}
          </Txt>
        ) : null}
        {children}
      </View>
    </Card>
  );
}

/** Thin ink progress bar on the trail hero: sets done over sets planned (only ever grows). */
function ResumeProgress({ fraction }: { fraction: number }): React.JSX.Element {
  const styles = useStyles();
  return (
    <View
      testID="resume-progress"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Session progress"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
      style={styles.progressTrack}
    >
      <View style={[styles.progressFill, { width: `${Math.round(fraction * 100)}%` }]} />
    </View>
  );
}

/** Square-ish two-up tile: icon in a tinted circle, condensed title, one small line. */
function ActionTile({
  testID,
  icon,
  tone,
  title,
  subtitle,
  onPress,
  disabled,
  loading,
}: {
  testID: string;
  icon: IconName;
  tone: AccentName;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={`${title}. ${subtitle}`}
      style={[styles.tile, disabled && styles.tileDisabled]}
    >
      {loading ? (
        <View style={styles.tileSpinner}>
          <ActivityIndicator color={theme.colors[tone]} />
        </View>
      ) : (
        <IconBadge icon={icon} tone={tone} />
      )}
      <View>
        <Txt variant="h2">{title}</Txt>
        <Txt variant="small" color="text2">
          {subtitle}
        </Txt>
      </View>
    </PressableScale>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.bg,
    },
    content: { paddingTop: space.lg, paddingBottom: space.huge + space.xxl, gap: space.xl },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerText: { flex: 1 },
    gate: { flex: 1, backgroundColor: t.colors.bg },
    gateScreen: { backgroundColor: 'transparent' },
    gateContent: {
      flexGrow: 1,
      justifyContent: 'center',
      gap: space.xxl,
      paddingVertical: space.xxl,
    },
    wordmark: { textAlign: 'left' },
    banner: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
    bannerText: { flex: 1, gap: 2, paddingTop: 2 },
    bannerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: space.sm,
      marginTop: space.sm,
    },
    hero: { minHeight: 220, justifyContent: 'space-between', gap: space.lg },
    heroTop: { gap: space.xs, alignItems: 'flex-start' },
    heroBottom: { gap: space.sm },
    heroPill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: t.colors.ink,
      borderRadius: radius.pill,
      paddingHorizontal: space.xl,
      height: 48,
      gap: space.sm,
    },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: withAlpha(t.colors.ink, 0.22),
      overflow: 'hidden',
    },
    progressFill: { height: 6, borderRadius: 3, backgroundColor: t.colors.ink },
    tiles: { flexDirection: 'row', gap: space.md },
    tile: {
      flex: 1,
      minHeight: 132,
      justifyContent: 'space-between',
      backgroundColor: t.colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: t.colors.line,
      padding: space.lg,
    },
    tileDisabled: { opacity: 0.5 },
    tileSpinner: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    weekBlock: { gap: space.md },
    weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
    weekDay: { alignItems: 'center', gap: space.xs },
    unlock: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
    unlockText: { flex: 1, gap: 2 },
  }),
);
