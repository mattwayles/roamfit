/**
 * §10.4/§10.5/§10.7 combined — the active workout loop. One screen (not three navigator routes)
 * so the elapsed-workout timer and rest timer never remount mid-session; phase transitions are
 * local component state, keyed remounts of the sub-view per set so each gets a fresh wall-clock
 * controller (see `useCountdown`/`wallClockTimer.ts`).
 *
 * Every mutation is a `@roamfit/store` call — `logSet`, `recordEntryFeedback`, `setPinnedNote`.
 * Nothing here computes a prescription or decides an exercise; §10.4's hierarchy rule (hero =
 * name + target + "Set N of M", nothing else at that size; body focus/pattern/difficulty never
 * shown) is honored by simply not reading those fields into the hero view.
 *
 * Known gaps in this pass (see STATUS-4-loop.md): mid-workout **swap** (§10.6) needs an
 * engine-exposed "alternatives for this pattern slot at this level" query that does not exist
 * yet — implementing candidate selection here would put exercise-selection logic in the UI
 * layer, which this wave's ground rule forbids, so it is not implemented rather than faked.
 * **Remove set** mid-workout has no store mutation to call (only §10.3 approval-time removal
 * exists) — also not implemented. Superset "Round N of M" display is simplified to plain
 * "Set N of M" (group/round math not modeled here for lack of a spec'd source of "M rounds").
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { exerciseStateRepo, progressionStateRepo, sessionsRepo } from '@roamfit/store';
import type { SessionRecord } from '@roamfit/store';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { nowUtcInstant } from '../lib/localClock';
import { useCountdown } from '../lib/useCountdown';
import { createStopwatchController, systemClock } from '../lib/wallClockTimer';
import PinnedNote from '../components/PinnedNote';
import FeedbackControls from '../components/FeedbackControls';
import type { Difficulty } from '../components/FeedbackControls';

type Props = NativeStackScreenProps<RootStackParamList, 'Workout'>;

type Phase = 'exercise' | 'resting';

function activeEntries(session: SessionRecord): sessionsRepo.SessionEntryRecord[] {
  return session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
}

/** The first not-yet-fully-logged (entry, setIndex) pair, in plan order — this is the entire
 *  crash-safety resume rule (§10.8): reconstructed purely from `set_logs` rows on every read,
 *  no separate cursor to go stale. */
function findCurrent(
  session: SessionRecord,
): { entry: sessionsRepo.SessionEntryRecord; setIndex: number } | null {
  for (const entry of activeEntries(session)) {
    if (entry.setLogs.length < entry.sets) {
      return { entry, setIndex: entry.setLogs.length };
    }
  }
  return null;
}

function levelBadge(
  entry: sessionsRepo.SessionEntryRecord,
  families: ReturnType<typeof useStore>['families'],
): string | null {
  if (!entry.progressionFamilyId || !entry.progressionLevelIdAtTime) return null;
  const family = families.families.find((f) => f.id === entry.progressionFamilyId);
  if (!family) return null;
  const index = family.levels.findIndex((l) => l.level_id === entry.progressionLevelIdAtTime);
  if (index === -1) return null;
  return `Level ${index + 1} of ${family.levels.length}`;
}

export default function WorkoutScreen({ navigation, route }: Props): React.JSX.Element {
  const { sessionId } = route.params;
  const { db, library, families } = useStore();
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [phase, setPhase] = useState<Phase>('exercise');
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [enjoyment, setEnjoyment] = useState<number | null>(null);
  const setStartedAtRef = useRef<string>(nowUtcInstant());
  const workoutStopwatch = useRef(createStopwatchController(systemClock));
  const [, forceElapsedTick] = useState(0);

  const reload = useCallback(
    () => setSession(sessionsRepo.getSession(db, sessionId)),
    [db, sessionId],
  );

  useEffect(() => {
    reload();
    if (!workoutStopwatch.current.isRunning()) workoutStopwatch.current.start();
    const id = setInterval(() => forceElapsedTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [reload]);

  const current = session ? findCurrent(session) : null;

  useEffect(() => {
    if (session && !current) {
      navigation.replace('Summary', { sessionId });
    }
  }, [session, current, navigation, sessionId]);

  if (!session) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!current) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const { entry, setIndex } = current;
  const exercise = library.exercises.find((e) => e.id === entry.exerciseId);
  const exState = exerciseStateRepo.getExerciseState(db, entry.exerciseId);
  const isFirstEverPerformance = !exState || exState.sessionsPerformed === 0;
  const progression = entry.progressionFamilyId
    ? progressionStateRepo.getProgressionState(db, entry.progressionFamilyId)
    : null;

  const finishSetAndRest = (
    status: 'completed' | 'skipped',
    repsActual?: number,
    secondsActual?: number,
  ) => {
    sessionsRepo.logSet(
      db,
      {
        entryId: entry.id,
        setIndex,
        status,
        repsPrescribed: entry.repTarget ?? undefined,
        secondsPrescribed: entry.durationSec ?? undefined,
        repsActual,
        secondsActual,
        startedAt: setStartedAtRef.current,
        completedAt: nowUtcInstant(),
        restPrescribedSec: entry.restSec,
      },
      nowUtcInstant(),
    );
    setDifficulty(null);
    setEnjoyment(null);
    setPhase('resting');
    reload();
  };

  const handleNextAfterRest = () => {
    setStartedAtRef.current = nowUtcInstant();
    setPhase('exercise');
    reload();
  };

  const handlePinnedNoteChange = (note: string) => {
    const clockToday = nowUtcInstant().slice(0, 10);
    exerciseStateRepo.setPinnedNote(
      db,
      entry.exerciseId,
      note.length > 0 ? note : null,
      nowUtcInstant(),
      clockToday,
    );
    reload();
  };

  const handleDifficultyChange = (d: Difficulty | undefined) => {
    setDifficulty(d ?? null);
    sessionsRepo.recordEntryFeedback(db, entry.id, { difficulty: d }, nowUtcInstant());
  };
  const handleEnjoymentChange = (e: number | undefined) => {
    setEnjoyment(e ?? null);
    sessionsRepo.recordEntryFeedback(db, entry.id, { enjoyment: e }, nowUtcInstant());
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.stage}>{entry.section}</Text>
      <Text style={styles.elapsed}>
        Elapsed {Math.floor(workoutStopwatch.current.elapsedMs() / 60000)}m{' '}
        {Math.floor((workoutStopwatch.current.elapsedMs() % 60000) / 1000)}s
      </Text>

      {phase === 'exercise' ? (
        entry.durationSec != null ? (
          <TimedExercise
            key={`${entry.id}-${setIndex}`}
            entry={entry}
            exerciseName={exercise?.name ?? entry.exerciseId}
            setIndex={setIndex}
            onComplete={(actualSeconds) => finishSetAndRest('completed', undefined, actualSeconds)}
            onSkip={() => finishSetAndRest('skipped')}
          />
        ) : (
          <RepsExercise
            key={`${entry.id}-${setIndex}`}
            entry={entry}
            exerciseName={exercise?.name ?? entry.exerciseId}
            setIndex={setIndex}
            onComplete={(reps) => finishSetAndRest('completed', reps)}
            onSkip={() => finishSetAndRest('skipped')}
          />
        )
      ) : (
        <RestPhase
          key={`rest-${entry.id}-${setIndex}`}
          restSec={entry.restSec}
          nextLabel={`${exercise?.name ?? entry.exerciseId} · set ${setIndex + 1} of ${entry.sets}`}
          difficulty={difficulty}
          enjoyment={enjoyment}
          onDifficultyChange={handleDifficultyChange}
          onEnjoymentChange={handleEnjoymentChange}
          onNext={handleNextAfterRest}
        />
      )}

      {phase === 'exercise' && (
        <>
          {levelBadge(entry, families) && (
            <Text style={styles.levelBadge}>{levelBadge(entry, families)}</Text>
          )}
          {progression?.calibrating && <Text style={styles.calibrating}>Calibrating</Text>}

          <PinnedNote note={exState?.pinnedNote ?? null} onChange={handlePinnedNoteChange} />

          <Disclosure
            title="How to"
            defaultOpen={isFirstEverPerformance}
            body={exercise?.setup ?? ''}
          />
        </>
      )}
    </ScrollView>
  );
}

function RepsExercise({
  entry,
  exerciseName,
  setIndex,
  onComplete,
  onSkip,
}: {
  entry: sessionsRepo.SessionEntryRecord;
  exerciseName: string;
  setIndex: number;
  onComplete: (reps: number) => void;
  onSkip: () => void;
}): React.JSX.Element {
  const [reps, setReps] = useState(entry.repTarget ?? 0);
  return (
    <View style={styles.hero}>
      <Text style={styles.exerciseName}>{exerciseName}</Text>
      <Text style={styles.target}>{entry.repTarget} reps</Text>
      <Text style={styles.setOf}>
        Set {setIndex + 1} of {entry.sets}
      </Text>

      <View style={styles.repCounterRow}>
        <Pressable
          testID="rep-minus"
          style={styles.repAdjustButton}
          onPress={() => setReps((r) => Math.max(0, r - 1))}
        >
          <Text style={styles.repAdjustText}>−</Text>
        </Pressable>
        <TextInput
          testID="rep-count"
          style={styles.repCountInput}
          keyboardType="number-pad"
          value={String(reps)}
          onChangeText={(t) => setReps(Number(t.replace(/[^0-9]/g, '')) || 0)}
        />
        <Pressable
          testID="rep-plus"
          style={styles.repAdjustButton}
          onPress={() => setReps((r) => r + 1)}
        >
          <Text style={styles.repAdjustText}>+</Text>
        </Pressable>
      </View>

      <Pressable
        testID="complete-set"
        style={styles.completeButton}
        onPress={() => onComplete(reps)}
      >
        <Text style={styles.completeButtonText}>COMPLETE</Text>
      </Pressable>

      <View style={styles.actionRow}>
        <Pressable testID="skip-set" style={styles.actionButton} onPress={onSkip}>
          <Text style={styles.actionButtonText}>Skip set</Text>
        </Pressable>
      </View>
    </View>
  );
}

function TimedExercise({
  entry,
  exerciseName,
  setIndex,
  onComplete,
  onSkip,
}: {
  entry: sessionsRepo.SessionEntryRecord;
  exerciseName: string;
  setIndex: number;
  onComplete: (actualSeconds: number) => void;
  onSkip: () => void;
}): React.JSX.Element {
  const durationMs = (entry.durationSec ?? 0) * 1000;
  const [started, setStarted] = useState(false);
  const [getReadyMs, setGetReadyMs] = useState(3000);
  const countdown = useCountdown(durationMs);
  const getReadyCountdown = useCountdown(3000);

  useEffect(() => {
    if (!started) return;
    const id = setInterval(() => {
      setGetReadyMs(getReadyCountdown.controller.remainingMs());
    }, 100);
    return () => clearInterval(id);
  }, [started]);

  const handleStart = () => {
    setStarted(true);
    getReadyCountdown.controller.start();
  };

  useEffect(() => {
    if (started && getReadyMs <= 0 && !countdown.controller.isRunning() && !countdown.isComplete) {
      countdown.controller.start();
    }
  }, [started, getReadyMs]);

  useEffect(() => {
    if (started && getReadyMs <= 0 && countdown.isComplete) {
      onComplete(entry.durationSec ?? 0);
    }
  }, [countdown.isComplete, started, getReadyMs]);

  const inGetReady = started && getReadyMs > 0;
  const remainingSeconds = Math.ceil(countdown.remainingMs / 1000);

  const handleEndEarly = () => {
    const held = (entry.durationSec ?? 0) - Math.floor(countdown.remainingMs / 1000);
    onComplete(Math.max(0, held));
  };

  return (
    <View style={styles.hero}>
      <Text style={styles.exerciseName}>{exerciseName}</Text>
      <Text style={styles.setOf}>
        Set {setIndex + 1} of {entry.sets}
      </Text>

      <View style={styles.circleTimer} testID="timed-circle">
        <Text style={styles.circleTimerText}>
          {!started ? 'Tap to start' : inGetReady ? Math.ceil(getReadyMs / 1000) : remainingSeconds}
        </Text>
      </View>

      {!started ? (
        <Pressable testID="start-timer" style={styles.completeButton} onPress={handleStart}>
          <Text style={styles.completeButtonText}>START</Text>
        </Pressable>
      ) : (
        <Pressable testID="end-early" style={styles.completeButton} onPress={handleEndEarly}>
          <Text style={styles.completeButtonText}>END EARLY</Text>
        </Pressable>
      )}

      <View style={styles.actionRow}>
        <Pressable testID="skip-set" style={styles.actionButton} onPress={onSkip}>
          <Text style={styles.actionButtonText}>Skip set</Text>
        </Pressable>
      </View>
    </View>
  );
}

function RestPhase({
  restSec,
  nextLabel,
  difficulty,
  enjoyment,
  onDifficultyChange,
  onEnjoymentChange,
  onNext,
}: {
  restSec: number;
  nextLabel: string;
  difficulty: Difficulty | null;
  enjoyment: number | null;
  onDifficultyChange: (d: Difficulty | undefined) => void;
  onEnjoymentChange: (e: number | undefined) => void;
  onNext: () => void;
}): React.JSX.Element {
  const countdown = useCountdown(restSec * 1000);
  useEffect(() => {
    countdown.controller.start();
  }, []);

  return (
    <View style={styles.hero}>
      <Text style={styles.stage}>Rest</Text>
      <View style={styles.circleTimer} testID="rest-circle">
        <Text style={styles.circleTimerText}>{Math.ceil(countdown.remainingMs / 1000)}</Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          testID="rest-minus-15"
          style={styles.actionButton}
          onPress={() => countdown.controller.addMs(-15_000)}
        >
          <Text style={styles.actionButtonText}>−15s</Text>
        </Pressable>
        <Pressable
          testID="rest-plus-15"
          style={styles.actionButton}
          onPress={() => countdown.controller.addMs(15_000)}
        >
          <Text style={styles.actionButtonText}>+15s</Text>
        </Pressable>
        <Pressable
          testID="rest-skip"
          style={styles.actionButton}
          onPress={() => countdown.controller.addMs(-countdown.remainingMs)}
        >
          <Text style={styles.actionButtonText}>Skip</Text>
        </Pressable>
      </View>

      <Text style={styles.nextUp}>Next up: {nextLabel}</Text>

      <FeedbackControls
        difficulty={difficulty}
        enjoyment={enjoyment}
        onDifficultyChange={onDifficultyChange}
        onEnjoymentChange={onEnjoymentChange}
      />

      <Pressable testID="rest-next" style={styles.completeButton} onPress={onNext}>
        <Text style={styles.completeButtonText}>NEXT</Text>
      </Pressable>
    </View>
  );
}

function Disclosure({
  title,
  body,
  defaultOpen,
}: {
  title: string;
  body: string;
  defaultOpen: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View>
      <Pressable testID="disclosure-toggle" onPress={() => setOpen((o) => !o)}>
        <Text style={styles.disclosureTitle}>
          {open ? '▾' : '▸'} {title}
        </Text>
      </Pressable>
      {open && <Text style={styles.disclosureBody}>{body}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, gap: 16 },
  stage: { fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  elapsed: { fontSize: 12, color: '#94a3b8' },
  hero: { alignItems: 'center', gap: 12 },
  exerciseName: { fontSize: 26, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  target: { fontSize: 20, fontWeight: '600', color: '#334155' },
  setOf: { fontSize: 15, color: '#64748b' },
  repCounterRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  repAdjustButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  repAdjustText: { fontSize: 22, fontWeight: '700' },
  repCountInput: {
    fontSize: 36,
    fontWeight: '800',
    minWidth: 80,
    textAlign: 'center',
  },
  completeButton: {
    backgroundColor: '#111',
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 40,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeButtonText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    minHeight: 44,
    justifyContent: 'center',
  },
  actionButtonText: { fontWeight: '600', color: '#334155' },
  circleTimer: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 6,
    borderColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleTimerText: { fontSize: 44, fontWeight: '800', color: '#0f172a' },
  levelBadge: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  calibrating: { fontSize: 12, color: '#b45309', fontWeight: '600' },
  nextUp: { fontSize: 13, color: '#64748b' },
  disclosureTitle: { fontSize: 14, fontWeight: '700', color: '#334155' },
  disclosureBody: { fontSize: 13, color: '#64748b', marginTop: 4 },
});
