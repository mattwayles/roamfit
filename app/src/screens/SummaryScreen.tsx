/**
 * §10.9 Summary & completion. Every set listed with actual vs. prescribed and status, an
 * optional retrospective textbox, then FINISH — the one call to `completeSession` (writes
 * history, progression, exercise state, milestones, and enqueues deferred work). Nothing here
 * computes progression or milestones itself; `../lib/celebration.ts` only shapes what
 * `completeSession` already decided into what to show and in what order.
 *
 * §6.4/§6.7: a level-up or a Mastery best-set PR is a celebrated, unmissable, full-screen moment
 * shown one at a time, **before** the plain completion summary — never stacked underneath it.
 * §9.10: a one-tap native share sheet on that celebration screen. No image-rendering library is
 * installed (checked `app/package.json`), so this ships as RN's built-in `Share.share` with a
 * formatted text card — a real share action, not a rendered PNG. Recorded as a scope cut in
 * STATUS-5-motivation.md; a future wave can add `react-native-view-shot` for a literal branded
 * image if product wants one.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { completeSession, milestonesRepo, sessionsRepo } from '@roamfit/store';
import type { CompleteSessionResult } from '@roamfit/store';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { nowUtcInstant } from '../lib/localClock';
import { buildCelebrationViewModel, type FullScreenCelebration } from '../lib/celebration';

type Props = NativeStackScreenProps<RootStackParamList, 'Summary'>;

function statusIcon(status: string): string {
  if (status === 'completed') return '✓';
  if (status === 'skipped') return '⚠';
  return '·';
}

/**
 * What a set line says it was. A skipped set used to render as its icon plus "— sec", which reads
 * like a set that happened and recorded nothing; it says "Skipped" now, because that is a
 * different fact about the day and the summary is where the user checks what they actually did.
 * Plain and unloaded, not a reprimand (invariant 4) — a skipped set is a choice, not a failure.
 */
function setResultText(log: sessionsRepo.SetLogRecord): string {
  if (log.status === 'skipped') return 'Skipped';
  if (log.status === 'not_reached') return 'Not reached';
  const actual = log.repsActual ?? log.secondsActual ?? null;
  if (actual === null) return '—';
  return `${actual} ${log.repsActual != null ? 'reps' : 'sec'}`;
}

function celebrationHeadline(c: FullScreenCelebration): string {
  return c.kind === 'level_up'
    ? `${c.familyName}: ${c.newExerciseName}`
    : `${c.familyName} Mastery — new best set`;
}

function celebrationShareText(c: FullScreenCelebration): string {
  return c.kind === 'level_up'
    ? `Just leveled up in RoamFit — ${c.familyName}, now training ${c.newExerciseName}.`
    : `New Mastery best set in RoamFit — ${c.familyName}: ${c.exerciseName}${
        c.value !== null ? ` (${c.value})` : ''
      }.`;
}

export default function SummaryScreen({ navigation, route }: Props): React.JSX.Element {
  const { sessionId } = route.params;
  const { db, library, families } = useStore();
  const [session, setSession] = useState<sessionsRepo.SessionRecord | null>(null);
  const [retrospective, setRetrospective] = useState('');
  const [result, setResult] = useState<CompleteSessionResult | null>(null);
  const [milestones, setMilestones] = useState<milestonesRepo.MilestoneRecord[]>([]);
  const [finished, setFinished] = useState(false);
  const [celebrationIndex, setCelebrationIndex] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setSession(sessionsRepo.getSession(db, sessionId));
    }, [db, sessionId]),
  );

  const celebration = useMemo(
    () =>
      result
        ? buildCelebrationViewModel(library, families, result.progressionEvents, milestones)
        : { fullScreen: [], quiet: [] },
    [result, milestones, library, families],
  );

  if (!session) return <View style={styles.centered} />;

  const handleShare = (text: string) => {
    // Fire-and-forget, matches §9.10 "never auto-posts" — this only opens the native share sheet;
    // where it goes from there is entirely the user's.
    void Share.share({ message: text });
  };

  if (finished && result) {
    const current = celebration.fullScreen[celebrationIndex];
    if (current) {
      return (
        <View style={styles.celebrationScreen} testID="level-up-celebration">
          <Text style={styles.celebrationEmoji}>{current.kind === 'level_up' ? '🎉' : '🏆'}</Text>
          <Text style={styles.celebrationEyebrow}>
            {current.kind === 'level_up' ? 'Level up!' : 'Mastery — new best set'}
          </Text>
          <Text style={styles.celebrationHeadline}>{celebrationHeadline(current)}</Text>
          <Pressable
            testID="celebration-share"
            style={styles.shareButton}
            onPress={() => handleShare(celebrationShareText(current))}
          >
            <Text style={styles.shareButtonText}>Share</Text>
          </Pressable>
          <Pressable
            testID="celebration-continue"
            style={styles.finishButton}
            onPress={() => setCelebrationIndex((i) => i + 1)}
          >
            <Text style={styles.finishButtonText}>
              {celebrationIndex < celebration.fullScreen.length - 1 ? 'Next' : 'Continue'}
            </Text>
          </Pressable>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.doneTitle}>Session complete</Text>
        <Text style={styles.doneSubtitle}>{Math.round(result.actualMinutes)} min</Text>

        {celebration.quiet.length > 0 && (
          <View testID="quiet-milestones" style={styles.quietMilestones}>
            {celebration.quiet.map((m, i) => (
              <Text key={i} style={styles.quietMilestoneText}>
                · {m.text}
              </Text>
            ))}
          </View>
        )}

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
    setMilestones(milestonesRepo.getMilestonesForSession(db, sessionId));
    setCelebrationIndex(0);
    setFinished(true);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>
        {session.focus} · {session.targetMinutes} min · {session.difficulty}
      </Text>

      {session.entries
        .filter((e) => e.entryStatus !== 'removed_at_approval')
        .map((entry) => (
          <View key={entry.id} style={styles.entryBlock} testID={`summary-${entry.exerciseId}`}>
            <Text style={styles.entryName}>
              {library.exercises.find((e) => e.id === entry.exerciseId)?.name ?? entry.exerciseId}
            </Text>
            {entry.setLogs.map((log) => (
              <Text key={log.id} style={styles.setLine}>
                {statusIcon(log.status)} Set {log.setIndex + 1}: {setResultText(log)}
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

      {/* The session is still `active` in the DB at this point — nothing is finalized until
          FINISH is tapped above — so going back to it is genuinely resuming, not reopening
          something already closed. Gone once FINISH is tapped (the `finished` screens below have
          no equivalent button): completeSession has run by then and there is nothing active left
          to return to. */}
      <Pressable
        testID="back-to-workout"
        style={styles.backButton}
        onPress={() => navigation.replace('Workout', { sessionId, reviewFromSummary: true })}
      >
        <Text style={styles.backButtonText}>Back to workout</Text>
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
  backButton: {
    marginTop: 12,
    padding: 16,
    alignItems: 'center',
  },
  backButtonText: { color: '#2563eb', fontSize: 15, fontWeight: '700' },
  doneTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  doneSubtitle: { fontSize: 14, color: '#64748b', textAlign: 'center' },
  quietMilestones: { gap: 4, marginTop: 8 },
  quietMilestoneText: { fontSize: 13, color: '#475569' },
  // §6.4/§6.7 — full-screen, unmissable, one at a time, before anything else.
  celebrationScreen: {
    flex: 1,
    backgroundColor: '#fef9c3',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  celebrationEmoji: { fontSize: 56 },
  celebrationEyebrow: {
    fontSize: 13,
    fontWeight: '700',
    color: '#a16207',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  celebrationHeadline: {
    fontSize: 24,
    fontWeight: '800',
    color: '#713f12',
    textAlign: 'center',
  },
  shareButton: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  shareButtonText: { color: '#854d0e', fontWeight: '700', fontSize: 15 },
});
