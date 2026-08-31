/**
 * §10.9 Summary & completion. Every set listed with actual vs. prescribed and status, an
 * optional retrospective textbox, level-ups celebrated full-screen before anything else, and
 * FINISH — which is the one call to `completeSession` (writes history, progression, exercise
 * state, milestones, and enqueues deferred work). Nothing here computes progression or
 * milestones itself; it only reads back what `completeSession` already decided.
 *
 * Not implemented in this pass: native share sheet on the level-up/milestone screen (§9.10) —
 * no share library wired yet, noted in STATUS-4-loop.md.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { completeSession, sessionsRepo } from '@roamfit/store';
import type { CompleteSessionResult } from '@roamfit/store';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { nowUtcInstant } from '../lib/localClock';

type Props = NativeStackScreenProps<RootStackParamList, 'Summary'>;

function statusIcon(status: string): string {
  if (status === 'completed') return '✓';
  if (status === 'skipped') return '⚠';
  return '·';
}

export default function SummaryScreen({ navigation, route }: Props): React.JSX.Element {
  const { sessionId } = route.params;
  const { db, library, families } = useStore();
  const [session, setSession] = useState<sessionsRepo.SessionRecord | null>(null);
  const [retrospective, setRetrospective] = useState('');
  const [result, setResult] = useState<CompleteSessionResult | null>(null);
  const [finished, setFinished] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setSession(sessionsRepo.getSession(db, sessionId));
    }, [db, sessionId]),
  );

  const levelUps = useMemo(
    () => result?.progressionEvents.filter((e) => e.event.kind === 'level_up') ?? [],
    [result],
  );

  if (!session) return <View style={styles.centered} />;

  if (finished && result) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        {levelUps.length > 0 && (
          <View style={styles.celebration} testID="level-up-celebration">
            <Text style={styles.celebrationTitle}>🎉 Level up!</Text>
            {levelUps.map((e, i) => (
              <Text key={i} style={styles.celebrationBody}>
                {e.familyId}
              </Text>
            ))}
          </View>
        )}
        <Text style={styles.doneTitle}>Session complete</Text>
        <Text style={styles.doneSubtitle}>
          {Math.round(result.actualMinutes)} min · {result.milestoneTypes.join(', ')}
        </Text>
        <Pressable
          testID="return-home"
          style={styles.finishButton}
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
        >
          <Text style={styles.finishButtonText}>Done</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const handleFinish = () => {
    const completion = completeSession(
      db,
      { sessionId, library, families, retrospective: retrospective || undefined },
      nowUtcInstant(),
    );
    setResult(completion);
    setFinished(true);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>
        {session.focus} · {session.targetMinutes} min · {session.effort}
      </Text>

      {session.entries
        .filter((e) => e.entryStatus !== 'removed_at_approval')
        .map((entry) => (
          <View key={entry.id} style={styles.entryBlock} testID={`summary-${entry.exerciseId}`}>
            <Text style={styles.entryName}>{entry.exerciseId}</Text>
            {entry.setLogs.map((log) => (
              <Text key={log.id} style={styles.setLine}>
                {statusIcon(log.status)} Set {log.setIndex + 1}:{' '}
                {log.repsActual ?? log.secondsActual ?? '—'}{' '}
                {log.repsActual != null ? 'reps' : 'sec'}
                {entry.difficultyFeedback ? ` · ${entry.difficultyFeedback}` : ''}
                {entry.enjoymentFeedback ? ` · ${entry.enjoymentFeedback}/5` : ''}
              </Text>
            ))}
          </View>
        ))}

      <Text style={styles.sectionLabel}>Retrospective (optional)</Text>
      <TextInput
        testID="retrospective-input"
        style={styles.retrospectiveInput}
        value={retrospective}
        onChangeText={setRetrospective}
        placeholder="How did that feel?"
        multiline
      />

      <Pressable testID="finish-button" style={styles.finishButton} onPress={handleFinish}>
        <Text style={styles.finishButtonText}>FINISH</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1 },
  container: { padding: 20, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  entryBlock: { gap: 2 },
  entryName: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  setLine: { fontSize: 13, color: '#475569' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#64748b', marginTop: 12 },
  retrospectiveInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 12,
    minHeight: 60,
    fontSize: 14,
  },
  finishButton: {
    marginTop: 16,
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    minHeight: 60,
    justifyContent: 'center',
  },
  finishButtonText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  celebration: {
    backgroundColor: '#fef9c3',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  celebrationTitle: { fontSize: 24, fontWeight: '800' },
  celebrationBody: { fontSize: 15, fontWeight: '600', color: '#854d0e' },
  doneTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  doneSubtitle: { fontSize: 14, color: '#64748b', textAlign: 'center' },
});
