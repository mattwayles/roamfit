/**
 * §10.3 Plan Approval. The §5.8 explanation line at top, sets/reps/band/rest per entry,
 * remove-at-approval and adjust-sets-at-approval (both real store mutations — nothing computed
 * here), Regenerate, and START (which transitions the already-created pending session to
 * 'active' via `startSession`).
 *
 * Not implemented in this pass (see docs/handoff/STATUS-4-loop.md "Known gaps"): adding a new
 * exercise and editing a rep target at approval — `packages/store`'s sessions repository has no
 * `addEntryAtApproval`/`adjustRepTargetAtApproval` mutation yet, and "Regenerate with a note"
 * needs the online LLM-intake path (§7.1), out of scope for the offline-first loop this wave
 * proves out.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createRng, seedFromString } from '@roamfit/engine';
import { generate, sessionsRepo } from '@roamfit/store';
import type { SessionRecord } from '@roamfit/store';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

type Props = NativeStackScreenProps<RootStackParamList, 'Approval'>;

function estimateMinutes(session: SessionRecord): number {
  const activeEntries = session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
  const totalSec = activeEntries.reduce((sum, e) => sum + e.sets * (e.estimatedSec + e.restSec), 0);
  return Math.round(totalSec / 60);
}

export default function ApprovalScreen({ navigation, route }: Props): React.JSX.Element {
  const { sessionId } = route.params;
  const { db, library, families } = useStore();
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const reload = useCallback(() => {
    setSession(sessionsRepo.getSession(db, sessionId));
  }, [db, sessionId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  if (!session) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const bySection = (section: 'warmup' | 'main' | 'cooldown') =>
    session.entries.filter((e) => e.section === section && e.entryStatus !== 'removed_at_approval');

  const handleRemove = (entry: sessionsRepo.SessionEntryRecord) => {
    sessionsRepo.removeEntryAtApproval(db, entry.id, nowUtcInstant());
    reload();
  };

  const handleAdjustSets = (entry: sessionsRepo.SessionEntryRecord, delta: number) => {
    const next = Math.max(1, entry.sets + delta);
    sessionsRepo.adjustSetsAtApproval(db, entry.id, next, nowUtcInstant());
    reload();
  };

  const handleRegenerate = () => {
    setRegenerating(true);
    try {
      sessionsRepo.recordRegenerateTap(db, sessionId, nowUtcInstant());
      const clock = nowEngineClock();
      const utcInstant = nowUtcInstant();
      const { plan, comebackTier, recoveryWeekManual } = generate(db, {
        library,
        families,
        request: {
          focus: session.focus,
          effort: session.effort,
          targetMinutes: session.targetMinutes,
        },
        clock,
        rng: createRng(seedFromString(utcInstant)),
        utcInstant,
      });
      // §10.10 — only one pending session; discard the old plan before creating the new one.
      sessionsRepo.discardSession(db, sessionId, {}, utcInstant);
      const newSessionId = sessionsRepo.createPendingSession(db, {
        plan,
        utcInstant,
        localDate: clock.today,
        tzId: clock.tzId,
        comebackTier,
        recoveryWeekManual,
      });
      navigation.replace('Approval', { sessionId: newSessionId });
    } finally {
      setRegenerating(false);
    }
  };

  const handleStart = () => {
    sessionsRepo.startSession(db, sessionId, nowUtcInstant());
    navigation.replace('Workout', { sessionId });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.explanation}>{session.explanation}</Text>
      <Text style={styles.estimate}>~{estimateMinutes(session)} min estimated</Text>

      {(['warmup', 'main', 'cooldown'] as const).map((section) => (
        <View key={section} style={styles.sectionBlock}>
          <Text style={styles.sectionHeading}>{section}</Text>
          {bySection(section).map((entry) => (
            <View key={entry.id} style={styles.entryRow} testID={`entry-${entry.exerciseId}`}>
              <View style={styles.entryInfo}>
                <Text style={styles.entryName}>{entry.exerciseId}</Text>
                <Text style={styles.entryDetail}>
                  {entry.sets} × {entry.repTarget ?? `${entry.durationSec}s`}
                  {entry.band ? ` · ${entry.band}` : ''} · rest {entry.restSec}s
                </Text>
              </View>
              <View style={styles.entryActions}>
                <Pressable
                  testID={`sets-minus-${entry.exerciseId}`}
                  style={styles.smallButton}
                  onPress={() => handleAdjustSets(entry, -1)}
                >
                  <Text style={styles.smallButtonText}>−</Text>
                </Pressable>
                <Pressable
                  testID={`sets-plus-${entry.exerciseId}`}
                  style={styles.smallButton}
                  onPress={() => handleAdjustSets(entry, 1)}
                >
                  <Text style={styles.smallButtonText}>+</Text>
                </Pressable>
                <Pressable
                  testID={`remove-${entry.exerciseId}`}
                  style={[styles.smallButton, styles.removeButton]}
                  onPress={() => handleRemove(entry)}
                >
                  <Text style={styles.smallButtonText}>✕</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ))}

      <Pressable
        testID="regenerate-button"
        style={styles.regenerateButton}
        onPress={handleRegenerate}
        disabled={regenerating}
      >
        <Text style={styles.regenerateButtonText}>Regenerate</Text>
      </Pressable>

      <Pressable testID="start-button" style={styles.startButton} onPress={handleStart}>
        <Text style={styles.startButtonText}>START</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, gap: 16 },
  explanation: { fontSize: 15, color: '#334155', lineHeight: 20 },
  estimate: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  sectionBlock: { gap: 8 },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 12,
  },
  entryInfo: { flex: 1, gap: 2 },
  entryName: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  entryDetail: { fontSize: 13, color: '#64748b' },
  entryActions: { flexDirection: 'row', gap: 6 },
  smallButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButton: { backgroundColor: '#fecaca' },
  smallButtonText: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  regenerateButton: {
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    minHeight: 48,
    justifyContent: 'center',
  },
  regenerateButtonText: { fontWeight: '600', color: '#334155' },
  startButton: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    minHeight: 60,
    justifyContent: 'center',
  },
  startButtonText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
