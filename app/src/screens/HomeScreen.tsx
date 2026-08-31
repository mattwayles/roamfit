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
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  generate,
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
import { buildProgressionBoard, nextUnlockHero, type FamilyBoardEntry } from '../lib/dashboard';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

interface HomeData {
  pending: sessionsRepo.SessionRecord | null;
  stats: statsRepo.RolledUpStatsRecord;
  user: usersRepo.UserRecord;
  board: FamilyBoardEntry[];
  comebackTier: 'none' | 'week' | 'reset';
  recentTzChangeToday: boolean;
  lifetimeMilestoneCount: number;
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
    setData({
      pending: sessionsRepo.getPendingSession(db),
      stats,
      user,
      board,
      comebackTier,
      recentTzChangeToday,
      lifetimeMilestoneCount: milestonesRepo.getAllMilestones(db).length,
    });
  }, [db, library, families]);

  useFocusEffect(
    useCallback(() => {
      load();
      setTravelDismissed(false);
    }, [load]),
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
        request: { focus: 'full', effort: 'normal', targetMinutes: 15, quickSession: true },
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

  const handleTravelDay = useCallback(() => {
    statsRepo.recordTravelDay(db, nowUtcInstant());
    load();
  }, [db, load]);

  const handleRecoveryWeekAccept = useCallback(() => {
    navigation.navigate('Generate', { recoveryWeek: true });
  }, [navigation]);

  if (data === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const { pending, stats, user, board, comebackTier } = data;
  const rolling = statsRepo.rollingSessionCount(stats, nowEngineClock().today);
  const denominator = statsRepo.effectiveWeeklyDenominator(
    user.weeklyTarget,
    stats.travelDaysThisWeek,
  );
  const suggestRecoveryWeek = statsRepo.shouldSuggestRecoveryWeek(stats);
  const isZeroSession = stats.lifetimeSessionCount === 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.appName}>RoamFit</Text>

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
            {pending.focus} · {pending.targetMinutes} min · {pending.effort}
          </Text>
          <Text style={styles.cardSubtitle}>
            {pending.status === 'active' ? 'In progress — tap to continue' : 'Ready to approve'}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          testID="today-card"
          style={[styles.card, styles.todayCard]}
          onPress={() => navigation.navigate('Generate')}
        >
          <Text style={styles.cardEyebrow}>Today</Text>
          <Text style={styles.cardTitle}>Generate a session</Text>
          <Text style={styles.cardSubtitle}>Pick your time, anchors, focus, and effort.</Text>
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
        </View>
        <Pressable testID="travel-day-button" style={styles.travelButton} onPress={handleTravelDay}>
          <Text style={styles.travelButtonIcon}>✈</Text>
          <Text style={styles.travelButtonText}>I&apos;m in transit</Text>
        </Pressable>
      </View>

      {hero ? (
        <View testID="next-unlock-hero" style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Next Unlock</Text>
          <Text style={styles.heroTitle}>
            {hero.exerciseName} — {hero.sessionsRemaining}{' '}
            {hero.sessionsRemaining === 1 ? 'session' : 'sessions'} from {hero.nextExerciseName}
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
        {board.map((entry) => (
          <View key={entry.familyId} style={styles.boardRow} testID={`board-row-${entry.familyId}`}>
            <View style={styles.boardRowHeader}>
              <Text style={styles.boardFamilyName}>{entry.familyName}</Text>
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
            </View>
            <Text style={styles.boardExerciseName}>{entry.exerciseName}</Text>
            <Text style={styles.boardUnlockLine}>
              {entry.isMastery
                ? 'At the top of this ladder — micro-progression keeps running.'
                : entry.sessionsToNextLevel !== null && entry.nextExerciseName
                  ? `${entry.sessionsToNextLevel} ${entry.sessionsToNextLevel === 1 ? 'session' : 'sessions'} from ${entry.nextExerciseName}`
                  : ''}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, gap: 16, paddingBottom: 48 },
  appName: { fontSize: 20, fontWeight: '700', color: '#111' },
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
  boardRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
});
