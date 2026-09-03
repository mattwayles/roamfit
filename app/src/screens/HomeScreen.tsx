/**
 * §10.1 Home / §14.1 Dashboard — one screen, spec's own order: resumable session or Today card,
 * Quick Session, This week, Next Unlock, then (scrolling) progression board, passport, calendar,
 * muscle balance, lifetime counters, estimate accuracy. §10.1 and §14.1 give the identical
 * ordering, so this is deliberately not split into a separate "Dashboard" screen — see
 * STATUS-5-motivation.md's "Key findings."
 *
 * §14.2 zero-session requirement: the progression board, Next Unlock, and the calibration
 * explanation must all render before the user has ever generated a session. `ensureProgressionStatesInitialized`
 * is called here (idempotent store call, not new persistence logic) so a fresh install has
 * starting-level progression rows to show without waiting for a first generation.
 *
 * Governing rule (§14, §1.1): every element accumulates monotonically or points at a concrete
 * next action. No daily streaks, no red/empty styling on untrained days, no guilt copy anywhere
 * on this screen — see the wave brief's "grep for shame" done-criterion.
 *
 * All state comes from `@roamfit/store` repositories and `@roamfit/engine` pure functions; the
 * only "decision" made in this file is which screen to route to and how to lay data out, never
 * what to generate, prescribe, or flag as over-worked (that's `dashboard.ts` calling straight
 * into the engine).
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  generate,
  levelUpFamily,
  milestonesRepo,
  progressionStateRepo,
  sessionsRepo,
  signalsRepo,
  statsRepo,
  usersRepo,
} from '@roamfit/store';
import type { ProgressionFamilyId } from '@roamfit/data';
import { assessComeback, createRng, seedFromString } from '@roamfit/engine';
import type { ProgressionState } from '@roamfit/engine';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import { findCurrentEntry } from '../lib/sessionProgress';
import AbandonSessionButton from '../components/AbandonSessionButton';
import { DISCLAIMER_TEXT } from './SettingsScreen';
import {
  buildCalendarDays,
  buildLifetimeCounters,
  buildMuscleBalanceRows,
  buildPassportSummary,
  buildProgressionBoard,
  nextUnlockHero,
  type CalendarDay,
  type FamilyBoardEntry,
  type LifetimeCounters,
  type MuscleBalanceRow,
  type PassportSummary,
} from '../lib/dashboard';
import {
  buildWeeklySummaryText,
  ensureNotificationPermission,
  scheduleMotivationNotifications,
} from '../lib/motivationNotifications';
import { runOpportunisticSync } from '../lib/opportunisticSync';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const CALENDAR_WINDOW_DAYS = 28;

interface HomeData {
  pending: sessionsRepo.SessionRecord | null;
  stats: statsRepo.RolledUpStatsRecord;
  user: usersRepo.UserRecord;
  board: FamilyBoardEntry[];
  comebackTier: 'none' | 'week' | 'reset';
  recentTzChangeToday: boolean;
  passport: PassportSummary;
  calendarDays: CalendarDay[];
  muscleBalance: MuscleBalanceRow[];
  lifetimeCounters: LifetimeCounters;
}

function weekDots(hit: number, denominator: number): string {
  const filled = Math.min(hit, denominator);
  return '●'.repeat(filled) + '○'.repeat(Math.max(0, denominator - filled));
}

export default function HomeScreen({ navigation }: Props): React.JSX.Element {
  const { db, library, families } = useStore();
  const [data, setData] = useState<HomeData | undefined>(undefined);
  const [startingQuick, setStartingQuick] = useState(false);
  const [travelDismissed, setTravelDismissed] = useState(false);
  /** ADR 0012 — one-line result of the last board level-up. Informational only: never blocks,
   *  never nags, replaced rather than stacked (invariant 4). */
  const [levelUpNotice, setLevelUpNotice] = useState<string | null>(null);
  /** Which family row is showing its "are you sure" step, if any. One at a time. */
  const [confirmingLevelUp, setConfirmingLevelUp] = useState<ProgressionFamilyId | null>(null);

  const load = useCallback(() => {
    const clock = nowEngineClock();
    progressionStateRepo.ensureProgressionStatesInitialized(
      db,
      families,
      library.exercises,
      clock.today,
    );
    const user = usersRepo.ensureUser(db, nowUtcInstant());
    const stats = statsRepo.ensureStats(db, nowUtcInstant());
    const states: Record<ProgressionFamilyId, ProgressionState> =
      progressionStateRepo.getAllProgressionStates(db);
    const board = buildProgressionBoard(library, families, states);
    const history = sessionsRepo.getHistoryForGeneration(db);
    const comebackTier = assessComeback(history, clock.today).tier;
    // §9.3 auto-suggest — consumes the tz_change signal Wave 3 already records (§8.3/users.ts's
    // `observeTzId`, called every generation). "Today" is a same-session heuristic: the most
    // recent tz_change event's local_date is today's. There's no persisted per-day dismissal
    // state (no schema for it), so a dismissal only lasts this screen visit — noted as a scope
    // simplification in STATUS-5-motivation.md rather than built out with new schema this wave.
    const tzChangeEvents = signalsRepo.getSignalEventsByType(db, 'tz_change');
    const latestTzChange = tzChangeEvents[tzChangeEvents.length - 1];
    const recentTzChangeToday = latestTzChange?.localDate === clock.today;

    const completedSessions = sessionsRepo.getCompletedSessionsForDashboard(db);
    const passport = buildPassportSummary(completedSessions);
    const calendarDays = buildCalendarDays(completedSessions, clock.today, CALENDAR_WINDOW_DAYS);
    const muscleBalance = buildMuscleBalanceRows(statsRepo.hardSetsByMuscle14d(db, clock.today));
    const milestones = milestonesRepo.getAllMilestones(db);
    const lifetimeCounters = buildLifetimeCounters(
      stats.lifetimeSessionCount,
      stats.lifetimeTotalMinutes,
      passport,
      milestones.filter((m) => m.type === 'level_up').length,
      milestones.filter((m) => m.type === 'best_set_pr').length,
    );

    setData({
      pending: sessionsRepo.getPendingSession(db),
      stats,
      user,
      board,
      comebackTier,
      recentTzChangeToday,
      passport,
      calendarDays,
      muscleBalance,
      lifetimeCounters,
    });

    // §9.8 — re-schedule the seven weekday notifications on every Home open (cheap, idempotent by
    // fixed identifier). Gated on `hasEverCompletedSession` — a fresh install with nothing to be
    // "adaptive" about yet shouldn't be prompted for notification permission or nagged at all,
    // consistent with §1.1's "never punish/never pressure" register extended to onboarding.
    if (user.hasEverCompletedSession) {
      void ensureNotificationPermission().then(() =>
        scheduleMotivationNotifications({
          startTimes: sessionsRepo.getCompletedSessionStartTimes(db),
          hero: nextUnlockHero(board),
          stats,
          rollingCount: statsRepo.rollingSessionCount(stats, clock.today),
          weeklyTarget: user.weeklyTarget,
          quietHoursEnabled: user.notificationPrefs.quietHoursEnabled ?? true,
        }),
      );
    }
  }, [db, library, families]);

  /**
   * ADR 0012 — the user says a rung is below them, so raise it. One rung per tap and repeatable,
   * because the cold start is level 1 and someone already training taps until the exercise on the
   * board looks like something they would actually do.
   *
   * Everything real happens in `levelUpFamily` (which is the engine's work, via the store); this
   * only decides what to say about the outcome and reloads the board.
   */
  const handleLevelUp = (entry: FamilyBoardEntry) => {
    setConfirmingLevelUp(null);
    const result = levelUpFamily(
      db,
      {
        familyId: entry.familyId,
        library,
        families,
        clock: nowEngineClock(),
        rng: createRng(seedFromString(nowUtcInstant())),
      },
      nowUtcInstant(),
    );
    if (result.status === 'levelled_up') {
      setLevelUpNotice(`${entry.familyName}: now at ${result.exerciseName}.`);
    } else if (result.status === 'at_max') {
      setLevelUpNotice(`${entry.familyName} is already at the top of its ladder — nice.`);
    } else if (result.status === 'no_eligible_exercise') {
      setLevelUpNotice(`The next ${entry.familyName} level needs an anchor you don't have set up.`);
    }
    load();
  };

  useFocusEffect(
    useCallback(() => {
      load();
      setTravelDismissed(false);
      setConfirmingLevelUp(null);
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

  const handleQuickSession = useCallback(() => {
    setStartingQuick(true);
    try {
      const clock = nowEngineClock();
      const utcInstant = nowUtcInstant();
      const { plan, comebackTier, recoveryWeekManual } = generate(db, {
        library,
        families,
        request: { focus: 'full', difficulty: 'medium', targetMinutes: 15, quickSession: true },
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
    statsRepo.recordTravelDay(db, nowUtcInstant());
    load();
  }, [db, load]);

  const handleRecoveryWeekAccept = useCallback(() => {
    navigation.navigate('Generate', { recoveryWeek: true });
  }, [navigation]);

  // §9.10 — share is a render step over data already on screen, never a new backend call.
  const handleShareWeeklySummary = useCallback(() => {
    if (!data) return;
    const clock = nowEngineClock();
    const rolling = statsRepo.rollingSessionCount(data.stats, clock.today);
    const { body } = buildWeeklySummaryText(data.stats, rolling, data.user.weeklyTarget);
    void Share.share({ message: `RoamFit — ${body}` });
  }, [data]);

  const handleSharePassport = useCallback(() => {
    if (!data) return;
    const { cities, countries, sessionsAbroad } = data.passport;
    void Share.share({
      message: `RoamFit — trained in ${cities.length} ${cities.length === 1 ? 'city' : 'cities'} and ${countries.length} ${countries.length === 1 ? 'country' : 'countries'} (${sessionsAbroad} ${sessionsAbroad === 1 ? 'session' : 'sessions'} abroad).`,
    });
  }, [data]);

  if (data === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const {
    pending,
    stats,
    user,
    board,
    comebackTier,
    passport,
    calendarDays,
    muscleBalance,
    lifetimeCounters,
  } = data;
  const rolling = statsRepo.rollingSessionCount(stats, nowEngineClock().today);
  const denominator = statsRepo.effectiveWeeklyDenominator(
    user.weeklyTarget,
    stats.travelDaysThisWeek,
  );
  const suggestRecoveryWeek = statsRepo.shouldSuggestRecoveryWeek(stats);
  const isZeroSession = stats.lifetimeSessionCount === 0;

  // §13.3 — the medical disclaimer must be shown on first launch, blocking, before any other
  // screen content. `hasAcknowledgedDisclaimer` is a one-way flag (usersRepo.acknowledgeDisclaimer)
  // so this only ever fires once per install; the permanent copy lives in Settings (issue #20/#37's
  // sibling gap — there was no settings screen at all before this wave).
  if (!user.hasAcknowledgedDisclaimer) {
    return (
      <View style={styles.centered} testID="disclaimer-gate">
        <ScrollView contentContainerStyle={styles.disclaimerGateContent}>
          <Text style={styles.appName}>RoamFit</Text>
          <Text style={styles.body} testID="disclaimer-gate-text">
            {DISCLAIMER_TEXT}
          </Text>
          <Pressable
            testID="disclaimer-acknowledge"
            style={styles.primaryButton}
            onPress={() => {
              usersRepo.acknowledgeDisclaimer(db, nowUtcInstant());
              load();
            }}
          >
            <Text style={styles.primaryButtonText}>I understand</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.appName}>RoamFit</Text>
        <View style={styles.headerLinks}>
          <Pressable testID="open-exercises" onPress={() => navigation.navigate('Exercises')}>
            <Text style={styles.settingsLink}>Exercises</Text>
          </Pressable>
          <Pressable testID="open-settings" onPress={() => navigation.navigate('Settings')}>
            <Text style={styles.settingsLink}>Settings</Text>
          </Pressable>
        </View>
      </View>

      {comebackTier !== 'none' && (
        <View testID="comeback-banner" style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>Welcome back — let&apos;s ease in.</Text>
        </View>
      )}

      {data.recentTzChangeToday && !travelDismissed && (
        <View testID="travel-suggest-banner" style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>Looks like you traveled.</Text>
          <View style={styles.travelSuggestRow}>
            <Pressable
              testID="travel-suggest-accept"
              onPress={() => {
                handleTravelDay();
                setTravelDismissed(true);
              }}
            >
              <Text style={styles.infoBannerAction}>Mark today as a travel day</Text>
            </Pressable>
            <Pressable testID="travel-suggest-dismiss" onPress={() => setTravelDismissed(true)}>
              <Text style={styles.infoBannerDismiss}>Not this time</Text>
            </Pressable>
          </View>
        </View>
      )}

      {suggestRecoveryWeek && (
        <Pressable
          testID="recovery-week-banner"
          style={styles.infoBanner}
          onPress={handleRecoveryWeekAccept}
        >
          <Text style={styles.infoBannerText}>
            Recovery week — lighter loads, same consistency.
          </Text>
          <Text style={styles.infoBannerSubtitle}>Tap to build one today</Text>
        </Pressable>
      )}

      {pending ? (
        <>
          <Pressable
            testID="resume-card"
            style={[styles.card, styles.resumeCard]}
            onPress={() =>
              navigation.navigate(pending.status === 'active' ? 'Workout' : 'Approval', {
                sessionId: pending.id,
              })
            }
          >
            <Text style={styles.cardEyebrow}>Resume session</Text>
            <Text style={styles.cardTitle}>
              {pending.focus} · {pending.targetMinutes} min · {pending.difficulty}
            </Text>
            <Text style={styles.cardSubtitle}>
              {pending.status === 'active' ? 'In progress — tap to continue' : 'Ready to approve'}
            </Text>
          </Pressable>
          <AbandonSessionButton onConfirm={handleAbandonPending} label="Abandon and start fresh" />
        </>
      ) : (
        <Pressable
          testID="today-card"
          style={[styles.card, styles.todayCard]}
          onPress={() => navigation.navigate('Generate')}
        >
          <Text style={styles.cardEyebrow}>Today</Text>
          <Text style={styles.cardTitle}>Generate a session</Text>
          <Text style={styles.cardSubtitle}>Pick your time, anchors, focus, and difficulty.</Text>
        </Pressable>
      )}

      <Pressable
        testID="quick-session-button"
        style={styles.quickButton}
        onPress={handleQuickSession}
        disabled={startingQuick || !!pending}
      >
        {startingQuick ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={styles.quickButtonTitle}>Quick Session</Text>
            <Text style={styles.quickButtonSubtitle}>~7 min · no pickers</Text>
          </>
        )}
      </Pressable>

      <View style={styles.weekRow}>
        <View>
          <Text style={styles.weekLabel}>This week</Text>
          <Text testID="week-dots" style={styles.weekDots}>
            {weekDots(rolling, denominator)}
          </Text>
          {stats.weekStreak > 0 && (
            <Text style={styles.weekStreak}>{stats.weekStreak} week streak</Text>
          )}
          {stats.lifetimeSessionCount > 0 && (
            <Pressable testID="share-weekly-summary" onPress={handleShareWeeklySummary}>
              <Text style={styles.shareLink}>Share</Text>
            </Pressable>
          )}
        </View>
        <Pressable testID="travel-day-button" style={styles.travelButton} onPress={handleTravelDay}>
          <Text style={styles.travelButtonIcon}>✈</Text>
          <Text style={styles.travelButtonText}>I&apos;m in transit</Text>
        </Pressable>
      </View>

      {hero ? (
        <View testID="next-unlock-hero" style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Next Unlock</Text>
          {/* Names the movement function ("Horizontal Push"), not an exercise. Not the one being
              unlocked (ADR 0014 — that is the reveal), and not the current one either: the
              current exercise is precisely what the unlock replaces, so headlining it dates the
              copy the moment the unlock lands. The pattern is true either side of the rung
              change, and titles the board row below, so hero and row read as one subject. */}
          <Text style={styles.heroTitle}>
            {hero.familyName} — {hero.sessionsRemaining}{' '}
            {hero.sessionsRemaining === 1 ? 'session' : 'sessions'} to next level
          </Text>
        </View>
      ) : (
        board.length > 0 && (
          <View testID="next-unlock-hero" style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>Next Unlock</Text>
            <Text style={styles.heroTitle}>
              Every family is at Mastery — keep chasing best sets on the board below.
            </Text>
          </View>
        )
      )}

      <Text style={styles.sectionLabel}>Progression board</Text>
      {isZeroSession && (
        <Text testID="calibration-explanation" style={styles.calibrationNote}>
          Your first few sessions set your starting levels — push a little and it&apos;ll calibrate
          fast.
        </Text>
      )}
      <View testID="progression-board" style={styles.board}>
        {levelUpNotice != null && (
          <Text testID="board-level-up-notice" style={styles.boardLevelUpNotice}>
            {levelUpNotice}
          </Text>
        )}
        {board.map((entry) => (
          <View key={entry.familyId} style={styles.boardRow} testID={`board-row-${entry.familyId}`}>
            {/* Two columns: identity on the left, status on the right. The unlock count sits
                directly beneath the level chip it belongs to, so the whole right edge reads as
                one answer to "where am I and how close am I". */}
            <View style={styles.boardTopRow}>
              <View style={styles.boardIdentity}>
                <Text style={styles.boardFamilyName}>{entry.familyName}</Text>
                <Text style={styles.boardExerciseName}>{entry.exerciseName}</Text>
              </View>

              <View style={styles.boardStatus}>
                {entry.isMastery ? (
                  <View style={styles.masteryBadge}>
                    <Text style={styles.masteryBadgeText}>Mastery</Text>
                  </View>
                ) : (
                  <View style={styles.levelBadge}>
                    <Text style={styles.levelBadgeText}>
                      Level {entry.ordinal.n} of {entry.ordinal.of}
                    </Text>
                  </View>
                )}

                {/* ADR 0014 — how close you are, made the loudest thing on the row. The next
                    exercise is deliberately not named: the unlock is the reward, and printing it
                    here spends that for nothing. */}
                {!entry.isMastery && entry.sessionsToNextLevel !== null && (
                  <View style={styles.unlockBlock}>
                    <Text
                      style={styles.unlockCount}
                      testID={`board-sessions-left-${entry.familyId}`}
                    >
                      {entry.sessionsToNextLevel}
                    </Text>
                    <Text style={styles.unlockCaption}>
                      {entry.sessionsToNextLevel === 1 ? 'session' : 'sessions'}
                      {'\n'}to next level
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {entry.isMastery ? (
              <Text style={styles.boardUnlockLine}>
                At the top of this ladder — micro-progression keeps running.
              </Text>
            ) : (
              entry.sessionsToNextLevel !== null &&
              entry.sessionsInLevel !== null &&
              entry.sessionsInLevel > 0 && (
                <View
                  style={styles.progressTrack}
                  testID={`board-progress-${entry.familyId}`}
                  accessibilityRole="progressbar"
                  accessibilityValue={{
                    min: 0,
                    max: entry.sessionsInLevel,
                    now: entry.sessionsInLevel - entry.sessionsToNextLevel,
                  }}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.round(
                          ((entry.sessionsInLevel - entry.sessionsToNextLevel) /
                            entry.sessionsInLevel) *
                            100,
                        )}%`,
                      },
                    ]}
                  />
                </View>
              )
            )}

            {/* ADR 0012 — raise the rung from the board, before generating anything. The board is
                where a ladder position is actually shown, and a level is a property of the user
                rather than of any one session, so this is the place to correct it. Nothing to
                offer at the top of a ladder (§6.7 Mastery). */}
            {!entry.isMastery &&
              (confirmingLevelUp === entry.familyId ? (
                /* Two-step confirm, same shape as `AbandonSessionButton`'s. Warranted because a
                   level-up is hard to take back: it resets this level's micro-progression to the
                   new rung's floor, and there is no "level down" control — the only way back is
                   §6.3's drop-a-level, which costs two failed sessions. Row-scoped, so only the
                   row you tapped is ever in this state. */
                <View
                  style={styles.levelUpConfirmBox}
                  testID={`board-level-up-confirm-${entry.familyId}`}
                >
                  <Text style={styles.levelUpConfirmText}>
                    Move {entry.familyName} up a level? The next rung is harder, and your progress
                    toward this unlock starts over.
                  </Text>
                  <View style={styles.levelUpConfirmButtons}>
                    <Pressable
                      testID={`board-level-up-cancel-${entry.familyId}`}
                      style={styles.levelUpCancelButton}
                      onPress={() => setConfirmingLevelUp(null)}
                    >
                      <Text style={styles.levelUpCancelText}>Not yet</Text>
                    </Pressable>
                    <Pressable
                      testID={`board-level-up-confirm-yes-${entry.familyId}`}
                      style={styles.levelUpConfirmButton}
                      onPress={() => handleLevelUp(entry)}
                    >
                      <Text style={styles.levelUpConfirmButtonText}>Level up</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  testID={`board-level-up-${entry.familyId}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${entry.exerciseName} is too easy — move up a level`}
                  style={styles.boardLevelUpButton}
                  onPress={() => setConfirmingLevelUp(entry.familyId)}
                >
                  <Text style={styles.boardLevelUpText} numberOfLines={1}>
                    Too easy — level up
                  </Text>
                </Pressable>
              ))}
          </View>
        ))}
      </View>

      {/* §9.6 Passport — opt-in, strings only, appears once there's something to pin (§14.2). */}
      {user.passportEnabled && passport.cities.length > 0 ? (
        <View testID="passport-section" style={styles.passportCard}>
          <Text style={styles.sectionLabel}>Passport</Text>
          <Text style={styles.passportHeadline}>
            You&apos;ve trained in {passport.cities.length}{' '}
            {passport.cities.length === 1 ? 'city' : 'cities'} and {passport.countries.length}{' '}
            {passport.countries.length === 1 ? 'country' : 'countries'}
          </Text>
          <Text style={styles.passportSubtitle}>
            {passport.sessionsAbroad} {passport.sessionsAbroad === 1 ? 'session' : 'sessions'}{' '}
            abroad · {passport.cities.slice(0, 6).join(' · ')}
            {passport.cities.length > 6 ? '…' : ''}
          </Text>
          <Pressable testID="share-passport" onPress={handleSharePassport}>
            <Text style={styles.shareLink}>Share</Text>
          </Pressable>
        </View>
      ) : (
        !user.passportEnabled &&
        stats.lifetimeSessionCount > 0 && (
          <Pressable
            testID="passport-opt-in"
            style={styles.passportOptIn}
            onPress={() => {
              usersRepo.updateUser(db, { passportEnabled: true }, nowUtcInstant());
              load();
            }}
          >
            <Text style={styles.passportOptInText}>
              Turn on Passport to pin the cities you train in
            </Text>
          </Pressable>
        )
      )}

      {/* §14.1.6 calendar heatmap — untrained days are neutral squares, never omitted or red. */}
      {stats.lifetimeSessionCount > 0 && (
        <View testID="calendar-heatmap">
          <Text style={styles.sectionLabel}>Last {CALENDAR_WINDOW_DAYS} days</Text>
          <View style={styles.calendarGrid}>
            {calendarDays.map((day) => (
              <View
                key={day.localDate}
                testID={`calendar-day-${day.localDate}`}
                style={[
                  styles.calendarCell,
                  day.minutes === null
                    ? styles.calendarCellUntrained
                    : day.minutes >= 30
                      ? styles.calendarCellLong
                      : styles.calendarCellShort,
                ]}
              />
            ))}
          </View>
        </View>
      )}

      {/* §14.1.7 muscle balance — the hero volume metric, hard sets per muscle, trailing 14 days.
          OVER-WORKED is informational only, styled identically to every other row (§1.1). */}
      {muscleBalance.length > 0 && (
        <View testID="muscle-balance">
          <Text style={styles.sectionLabel}>Muscle balance · trailing 14 days</Text>
          {muscleBalance.map((row) => {
            const maxSets = muscleBalance[0].hardSets || 1;
            return (
              <View key={row.muscle} style={styles.muscleRow} testID={`muscle-row-${row.muscle}`}>
                <Text style={styles.muscleLabel}>{row.muscle}</Text>
                <View style={styles.muscleBarTrack}>
                  <View
                    style={[
                      styles.muscleBarFill,
                      { width: `${Math.min(100, (row.hardSets / maxSets) * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.muscleSets}>
                  {row.hardSets}
                  {row.overWorked ? ' · over-worked' : ''}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* §14.1.8 lifetime counters — monotonic, permanent. */}
      {stats.lifetimeSessionCount > 0 && (
        <View testID="lifetime-counters" style={styles.countersGrid}>
          <Counter label="Sessions" value={lifetimeCounters.sessions} />
          <Counter label="Minutes" value={lifetimeCounters.totalMinutes} />
          <Counter label="Cities" value={lifetimeCounters.cities} />
          <Counter label="Countries" value={lifetimeCounters.countries} />
          <Counter label="Levels gained" value={lifetimeCounters.levelsGained} />
          <Counter label="Best sets" value={lifetimeCounters.bestSets} />
        </View>
      )}

      {/* §14.1.9 estimate-accuracy trust-builder — small, quiet. */}
      {stats.estimateAccuracyEma !== null && (
        <Text testID="estimate-accuracy" style={styles.estimateAccuracyText}>
          Your sessions finish within {Math.round(stats.estimateAccuracyEma * 100)}% of the
          estimate.
        </Text>
      )}
    </ScrollView>
  );
}

function Counter({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <View style={styles.counterCell}>
      <Text style={styles.counterValue}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, gap: 16, paddingBottom: 48 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  appName: { fontSize: 20, fontWeight: '700', color: '#111' },
  headerLinks: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  settingsLink: { fontSize: 14, color: '#1d4ed8', fontWeight: '600' },
  disclaimerGateContent: { padding: 24, gap: 16, alignItems: 'stretch' },
  body: { fontSize: 14, lineHeight: 20, color: '#334155' },
  primaryButton: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  card: { borderRadius: 16, padding: 20, gap: 4 },
  todayCard: { backgroundColor: '#111' },
  resumeCard: { backgroundColor: '#1d4ed8' },
  cardEyebrow: { color: '#cbd5e1', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  cardTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  cardSubtitle: { color: '#e2e8f0', fontSize: 14 },
  quickButton: {
    backgroundColor: '#16a34a',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    minHeight: 64,
    justifyContent: 'center',
  },
  quickButtonTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  quickButtonSubtitle: { color: '#dcfce7', fontSize: 13 },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  weekLabel: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  weekDots: { fontSize: 18, letterSpacing: 2, color: '#0f172a' },
  weekStreak: { fontSize: 12, color: '#64748b', marginTop: 2 },
  shareLink: { fontSize: 12, color: '#2563eb', fontWeight: '700', marginTop: 4 },
  travelButton: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  travelButtonIcon: { fontSize: 16 },
  travelButtonText: { fontSize: 11, color: '#334155', fontWeight: '600' },
  infoBanner: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 14,
    gap: 2,
  },
  infoBannerText: { color: '#1e3a8a', fontSize: 14, fontWeight: '700' },
  infoBannerSubtitle: { color: '#3b82f6', fontSize: 12, fontWeight: '600' },
  travelSuggestRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  infoBannerAction: { color: '#1d4ed8', fontSize: 13, fontWeight: '700' },
  infoBannerDismiss: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  heroCard: {
    backgroundColor: '#fefce8',
    borderRadius: 16,
    padding: 18,
    gap: 4,
  },
  heroEyebrow: {
    color: '#a16207',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroTitle: { color: '#713f12', fontSize: 16, fontWeight: '700' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#64748b', marginTop: 8 },
  calibrationNote: { fontSize: 13, color: '#64748b', fontStyle: 'italic', marginTop: -8 },
  board: { gap: 10 },
  boardRow: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  boardFamilyName: { fontSize: 13, fontWeight: '700', color: '#334155' },
  levelBadge: {
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  levelBadgeText: { fontSize: 11, fontWeight: '700', color: '#334155' },
  masteryBadge: {
    backgroundColor: '#fde68a',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  masteryBadgeText: { fontSize: 11, fontWeight: '700', color: '#713f12' },
  boardExerciseName: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  boardUnlockLine: { fontSize: 12, color: '#64748b' },
  boardLevelUpButton: {
    marginTop: 8,
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  boardLevelUpText: { fontSize: 13, fontWeight: '600', color: '#1d4ed8' },
  levelUpConfirmBox: {
    marginTop: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    gap: 10,
  },
  levelUpConfirmText: { fontSize: 13, color: '#334155', lineHeight: 18 },
  levelUpConfirmButtons: { flexDirection: 'row', gap: 10 },
  levelUpCancelButton: {
    flex: 1,
    borderRadius: 8,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
  },
  levelUpCancelText: { fontSize: 13, fontWeight: '700', color: '#334155' },
  levelUpConfirmButton: {
    flex: 1,
    borderRadius: 8,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1d4ed8',
  },
  levelUpConfirmButtonText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  boardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  boardIdentity: { flex: 1 },
  boardStatus: { alignItems: 'flex-end' },
  unlockBlock: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  unlockCount: { fontSize: 34, fontWeight: '800', color: '#0f172a', lineHeight: 38 },
  unlockCaption: { fontSize: 12, color: '#475569', lineHeight: 16, textAlign: 'right' },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e2e8f0',
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: '#1d4ed8' },
  boardLevelUpNotice: { fontSize: 13, color: '#1d4ed8', paddingBottom: 4 },
  passportCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  passportHeadline: { fontSize: 16, fontWeight: '700', color: '#14532d' },
  passportSubtitle: { fontSize: 12, color: '#166534' },
  passportOptIn: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
  },
  passportOptInText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  calendarCell: { width: 16, height: 16, borderRadius: 4 },
  calendarCellUntrained: { backgroundColor: '#e2e8f0' },
  calendarCellShort: { backgroundColor: '#86efac' },
  calendarCellLong: { backgroundColor: '#16a34a' },
  muscleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  muscleLabel: { width: 90, fontSize: 12, color: '#334155', fontWeight: '600' },
  muscleBarTrack: {
    flex: 1,
    height: 10,
    borderRadius: 6,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  muscleBarFill: { height: '100%', backgroundColor: '#6366f1', borderRadius: 6 },
  muscleSets: { width: 90, fontSize: 11, color: '#64748b', textAlign: 'right' },
  countersGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  counterCell: { width: '30%', gap: 2 },
  counterValue: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  counterLabel: { fontSize: 11, color: '#64748b' },
  estimateAccuracyText: { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 4 },
});
