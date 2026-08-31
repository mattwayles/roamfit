/**
 * §10.1 Home. Action above analytics: a resumable pending session (or the today
 * recommendation) sits at the very top, Quick Session is a full peer of the main CTA, and the
 * rest of the dashboard (progression board, passport, calendar, muscle balance — Wave 5
 * territory) is deliberately not built here yet.
 *
 * All state comes from `@roamfit/store` repositories; the only "decision" made in this file is
 * which screen to route to, never what to generate or prescribe.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { generate, sessionsRepo, statsRepo } from '@roamfit/store';
import { createRng, seedFromString } from '@roamfit/engine';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props): React.JSX.Element {
  const { db, library, families } = useStore();
  const [pending, setPending] = useState<sessionsRepo.SessionRecord | null | undefined>(undefined);
  const [stats, setStats] = useState<statsRepo.RolledUpStatsRecord | null>(null);
  const [startingQuick, setStartingQuick] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setPending(sessionsRepo.getPendingSession(db));
      setStats(statsRepo.getStats(db));
    }, [db]),
  );

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

  if (pending === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.appName}>RoamFit</Text>

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

      {stats && (
        <View style={styles.weekRow}>
          <Text style={styles.weekLabel}>This week</Text>
          <Text style={styles.weekDots}>
            {'●'.repeat(Math.min(stats.lifetimeSessionCount, 7))}
            {'○'.repeat(Math.max(0, 7 - stats.lifetimeSessionCount))}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, gap: 16 },
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
  weekRow: { gap: 4 },
  weekLabel: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  weekDots: { fontSize: 18, letterSpacing: 2 },
});
