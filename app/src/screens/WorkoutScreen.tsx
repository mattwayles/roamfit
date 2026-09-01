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
 * **Remove set** mid-workout has no store mutation to call (only §10.3 approval-time removal
 * exists) — also not implemented. Superset "Round N of M" display is simplified to plain
 * "Set N of M" (group/round math not modeled here for lack of a spec'd source of "M rounds").
 *
 * §10.6 mid-workout swap: `alternativesForSlot` (from `@roamfit/engine`) selects and ranks the
 * 3-5 candidates; this screen only calls it with the current entry + user state and hands the
 * result to `SwapSheet` to render. Confirming a pick calls `sessionsRepo.recordSwap` and reloads
 * — no re-approval, no regeneration, and the session stopwatch (a ref, untouched by this) never
 * pauses.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { exerciseStateRepo, progressionStateRepo, sessionsRepo, usersRepo } from '@roamfit/store';
import type { SessionRecord } from '@roamfit/store';
import { alternativesForSlot } from '@roamfit/engine';
import type { SwapAlternative } from '@roamfit/engine';
import type { AnchorClass, Pattern, ProgressionFamilyId } from '@roamfit/data';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import { useCountdown } from '../lib/useCountdown';
import { createStopwatchController, systemClock } from '../lib/wallClockTimer';
import PinnedNote from '../components/PinnedNote';
import FeedbackControls from '../components/FeedbackControls';
import type { Difficulty } from '../components/FeedbackControls';
import SwapSheet from '../components/SwapSheet';
import DemoMedia from '../components/DemoMedia';
import {
  configureWorkoutAudioSession,
  cueCompletion,
  cueCount,
  cueHalfway,
  cueRestZero,
  cueStart,
} from '../lib/workoutAudio';
import {
  cancelRestNotification,
  ensureNotificationPermission,
  scheduleRestZeroNotification,
} from '../lib/workoutNotifications';

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
  // §10.8 — "Keep-awake for the whole active session; released on completion or abandonment."
  // `useKeepAwake` activates on mount and deactivates automatically on unmount, which covers
  // both cases: navigating to Summary on completion, or navigating away (Home/back) on
  // abandonment both unmount this screen.
  useKeepAwake();

  const { sessionId } = route.params;
  const { db, library, families, figures } = useStore();
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [phase, setPhase] = useState<Phase>('exercise');
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [enjoyment, setEnjoyment] = useState<number | null>(null);
  // §8.1 — which entry the rest screen's feedback controls apply to (the one just performed,
  // not `current`'s post-reload "next up" entry). See the comment in `finishSetAndRest`.
  const [restingEntryId, setRestingEntryId] = useState<string | null>(null);
  // Same reasoning, for the §10.7 "+15s recorded as a fatigue signal" write: the set just
  // completed, not whatever `current`'s post-reload setIndex points at during the rest phase.
  const [restingSetIndex, setRestingSetIndex] = useState<number | null>(null);
  const setStartedAtRef = useRef<string>(nowUtcInstant());
  const workoutStopwatch = useRef(createStopwatchController(systemClock));
  const [, forceElapsedTick] = useState(0);
  // §10.6 mid-workout swap — closed by default; opened from the Swap action on either
  // exercise-phase sub-view. The session stopwatch above is unaffected either way (it's a ref,
  // not paused by this state), satisfying "no interruption of the session timer."
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapExcludeAnchor, setSwapExcludeAnchor] = useState(false);

  const reload = useCallback(
    () => setSession(sessionsRepo.getSession(db, sessionId)),
    [db, sessionId],
  );

  useEffect(() => {
    reload();
    if (!workoutStopwatch.current.isRunning()) workoutStopwatch.current.start();
    const id = setInterval(() => forceElapsedTick((n) => n + 1), 1000);
    // §10.8 — configured once for the life of the session, re-asserted here rather than only at
    // app boot: the guard against Wave 6's YouTube player having last left the shared audio
    // session in a different shape (see workoutAudio.ts's file header). No persisted "silent
    // switch override" setting exists yet (no settings UI in this track's scope) — defaults to
    // `false`, the safe choice: cues respect the physical silent switch until a future settings
    // screen wires a real override through.
    void configureWorkoutAudioSession(false);
    void ensureNotificationPermission();
    return () => clearInterval(id);
  }, [reload]);

  const current = session ? findCurrent(session) : null;
  const entry = current?.entry;
  const exercise = entry ? library.exercises.find((e) => e.id === entry.exerciseId) : undefined;

  useEffect(() => {
    if (session && !current) {
      navigation.replace('Summary', { sessionId });
    }
  }, [session, current, navigation, sessionId]);

  // Hooks must run unconditionally every render — this screen has early `return`s below (loading
  // states) that would otherwise change the hook count between renders (a real bug this track
  // hit while wiring swap: "Rendered more hooks than during the previous render"). Everything
  // that reads `entry`/`exercise` guards internally on them being present instead.
  const swapAlternatives: SwapAlternative[] = useMemo(() => {
    if (!swapOpen || !entry) return [];
    const clock = nowEngineClock();
    const profile = usersRepo.buildUserProfile(db, clock.today);
    return alternativesForSlot({
      library: library.exercises,
      entry: {
        exerciseId: entry.exerciseId,
        role: 'main',
        band: entry.band,
        sets: entry.sets,
        repTarget: entry.repTarget ?? undefined,
        durationSec: entry.durationSec ?? undefined,
        restSec: entry.restSec,
        tempoSec: entry.tempoSec,
        notes: entry.notes ?? undefined,
        effort: entry.effort,
        progressionFamilyId: entry.progressionFamilyId as ProgressionFamilyId | null,
        progressionLevelIdAtTime: entry.progressionLevelIdAtTime,
        pattern: entry.pattern as Pattern,
        anchorClass: entry.anchorClass as AnchorClass,
        unilateral: entry.unilateral,
        estimatedSec: entry.estimatedSec,
      },
      anchorsAvailable: profile.anchorsAvailable,
      limitations: profile.limitations,
      today: clock.today,
      history: sessionsRepo.getHistoryForGeneration(db),
      exerciseStates: exerciseStateRepo.getAllExerciseStates(db),
      excludeAnchor: swapExcludeAnchor ? exercise?.anchor : undefined,
    });
  }, [swapOpen, swapExcludeAnchor, entry, exercise, db, library]);

  if (!session) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!current || !entry) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const { setIndex } = current;
  const exState = exerciseStateRepo.getExerciseState(db, entry.exerciseId);
  const isFirstEverPerformance = !exState || exState.sessionsPerformed === 0;
  const progression = entry.progressionFamilyId
    ? progressionStateRepo.getProgressionState(db, entry.progressionFamilyId)
    : null;

  const handleSwapSelect = (alt: SwapAlternative) => {
    sessionsRepo.recordSwap(db, entry.id, alt.replacement, setIndex, nowUtcInstant());
    setSwapOpen(false);
    setSwapExcludeAnchor(false);
    reload();
  };

  const finishSetAndRest = (
    status: 'completed' | 'skipped',
    repsActual?: number,
    secondsActual?: number,
    pauseInfo?: { pauseCount: number; pausedDurationSec: number },
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
        pauseCount: pauseInfo?.pauseCount,
        pausedDurationSec: pauseInfo?.pausedDurationSec,
      },
      nowUtcInstant(),
    );
    // §8.1 — feedback is about the exercise just performed, not whatever `reload()` (called
    // right below) causes `current`/`entry` to recompute to next render (the *upcoming* entry,
    // which is what `nextLabel`'s "Next up" preview correctly wants instead). Captured here,
    // before reload, so the rest screen's feedback controls target the right exercise.
    setRestingEntryId(entry.id);
    setRestingSetIndex(setIndex);
    setDifficulty(null);
    setEnjoyment(null);
    setPhase('resting');
    reload();
  };

  /** §10.7 — "+15s taps are recorded as a fatigue signal." `logSet` is a full-row upsert (no
   *  partial merge), so this reads the just-logged row back and re-submits it whole with only
   *  `restExtendedCount` bumped — otherwise a naive partial call would null out the
   *  reps/seconds actuals `finishSetAndRest` just wrote. Targets `restingEntryId`/
   *  `restingSetIndex`, not `entry`/`setIndex` — same reasoning as §8.1 feedback above; those
   *  already point at the *next* entry by the time the rest screen is showing. */
  const handleRestExtend = () => {
    if (!session || restingEntryId == null || restingSetIndex == null) return;
    const restEntry = session.entries.find((e) => e.id === restingEntryId);
    const setLog = restEntry?.setLogs.find((s) => s.setIndex === restingSetIndex);
    if (!restEntry || !setLog) return;
    sessionsRepo.logSet(
      db,
      {
        entryId: restEntry.id,
        setIndex: restingSetIndex,
        status: setLog.status,
        repsPrescribed: setLog.repsPrescribed ?? undefined,
        secondsPrescribed: setLog.secondsPrescribed ?? undefined,
        repsActual: setLog.repsActual ?? undefined,
        secondsActual: setLog.secondsActual ?? undefined,
        startedAt: setLog.startedAt ?? undefined,
        completedAt: setLog.completedAt ?? undefined,
        restPrescribedSec: setLog.restPrescribedSec,
        restTakenSec: setLog.restTakenSec ?? undefined,
        restExtendedCount: setLog.restExtendedCount + 1,
        pauseCount: setLog.pauseCount,
        pausedDurationSec: setLog.pausedDurationSec,
      },
      nowUtcInstant(),
    );
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

  // §11.4 — the callbacks DemoMedia fires; every persistence call goes through @roamfit/store,
  // never inline here (ADR 0003 / issue #13). `videoFlagState` reads fresh on every render off
  // the current entry's exercise, same pattern as `exState` above.
  const videoFlagState = exerciseStateRepo.getVideoFlagState(db, entry.exerciseId);
  const handleDemoExpand = () => {
    sessionsRepo.recordDemoMediaExpanded(db, entry.id, nowUtcInstant());
  };
  const handleReportVideoIssue = () => {
    const clockToday = nowUtcInstant().slice(0, 10);
    exerciseStateRepo.reportVideoIssue(
      db,
      entry.exerciseId,
      'user_report',
      nowUtcInstant(),
      clockToday,
    );
    reload();
  };
  const handleDemoPlayerError = () => {
    const clockToday = nowUtcInstant().slice(0, 10);
    exerciseStateRepo.reportVideoIssue(
      db,
      entry.exerciseId,
      'player_error',
      nowUtcInstant(),
      clockToday,
    );
    reload();
  };

  const handleDifficultyChange = (d: Difficulty | undefined) => {
    setDifficulty(d ?? null);
    sessionsRepo.recordEntryFeedback(
      db,
      restingEntryId ?? entry.id,
      { difficulty: d ?? null }, // explicit null = "cleared," per recordEntryFeedback's contract
      nowUtcInstant(),
    );
  };
  const handleEnjoymentChange = (e: number | undefined) => {
    setEnjoyment(e ?? null);
    sessionsRepo.recordEntryFeedback(
      db,
      restingEntryId ?? entry.id,
      { enjoyment: e ?? null },
      nowUtcInstant(),
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.stage}>{entry.section}</Text>
      <Text style={styles.elapsed}>
        Elapsed {Math.floor(workoutStopwatch.current.elapsedMs() / 60000)}m{' '}
        {Math.floor((workoutStopwatch.current.elapsedMs() % 60000) / 1000)}s
      </Text>

      {phase === 'exercise' ? (
        swapOpen ? (
          <SwapSheet
            alternatives={swapAlternatives}
            excludeAnchor={swapExcludeAnchor}
            onToggleExcludeAnchor={setSwapExcludeAnchor}
            onSelect={handleSwapSelect}
            onCancel={() => {
              setSwapOpen(false);
              setSwapExcludeAnchor(false);
            }}
          />
        ) : entry.durationSec != null ? (
          <TimedExercise
            key={`${entry.id}-${setIndex}`}
            entry={entry}
            exerciseName={exercise?.name ?? entry.exerciseId}
            setIndex={setIndex}
            onComplete={(actualSeconds, pauseInfo) =>
              finishSetAndRest('completed', undefined, actualSeconds, pauseInfo)
            }
            onSkip={() => finishSetAndRest('skipped')}
            onSwap={() => setSwapOpen(true)}
          />
        ) : (
          <RepsExercise
            key={`${entry.id}-${setIndex}`}
            entry={entry}
            exerciseName={exercise?.name ?? entry.exerciseId}
            setIndex={setIndex}
            onComplete={(reps) => finishSetAndRest('completed', reps)}
            onSkip={() => finishSetAndRest('skipped')}
            onSwap={() => setSwapOpen(true)}
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
          onExtend={handleRestExtend}
        />
      )}

      {phase === 'exercise' && (
        <>
          {levelBadge(entry, families) && (
            <Text style={styles.levelBadge}>{levelBadge(entry, families)}</Text>
          )}
          {progression?.calibrating && <Text style={styles.calibrating}>Calibrating</Text>}

          <PinnedNote note={exState?.pinnedNote ?? null} onChange={handlePinnedNoteChange} />

          {exercise && figures[exercise.id] && (
            <DemoMedia
              figureSvg={figures[exercise.id]}
              videoSearchQuery={exercise.video_search}
              // §11.4 — remote config isn't synced yet (track 6d, not started); always null
              // until 6d wires a real read here. The ladder correctly falls back to the figure.
              curatedVideoId={null}
              videoDemoted={videoFlagState.demoted}
              defaultOpen={isFirstEverPerformance}
              onExpand={handleDemoExpand}
              onReportIssue={handleReportVideoIssue}
              onPlayerError={handleDemoPlayerError}
            />
          )}

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
  onSwap,
}: {
  entry: sessionsRepo.SessionEntryRecord;
  exerciseName: string;
  setIndex: number;
  onComplete: (reps: number) => void;
  onSkip: () => void;
  onSwap: () => void;
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
        <Pressable testID="swap-set" style={styles.actionButton} onPress={onSwap}>
          <Text style={styles.actionButtonText}>Swap</Text>
        </Pressable>
        <Pressable testID="skip-set" style={styles.actionButton} onPress={onSkip}>
          <Text style={styles.actionButtonText}>Skip set</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** §10.5 — "a short switch-side interval" between a unilateral exercise's two sequential
 *  timers. Not spec'd as a specific number; 5s is enough to physically reposition without being
 *  long enough to feel like a second rest. */
const SWITCH_SIDE_SEC = 5;

interface PauseInfo {
  pauseCount: number;
  pausedDurationSec: number;
}

function TimedExercise({
  entry,
  exerciseName,
  setIndex,
  onComplete,
  onSkip,
  onSwap,
}: {
  entry: sessionsRepo.SessionEntryRecord;
  exerciseName: string;
  setIndex: number;
  /** §10.5 — "actual seconds held are recorded," summed across both sides for unilateral work.
   *  `pauseInfo` is the §8.3 pause signal (`set_logs.pause_count`/`paused_duration_sec`), also
   *  summed across sides. */
  onComplete: (actualSeconds: number, pauseInfo: PauseInfo) => void;
  onSkip: () => void;
  onSwap: () => void;
}): React.JSX.Element {
  const durationMs = (entry.durationSec ?? 0) * 1000;
  // §10.5 — "unilateral timed work runs two sequential timers with a short switch-side interval
  // between them." `sideIndex` is 0 for the only side (bilateral) or the first side
  // (unilateral), 1 for a unilateral exercise's second side.
  const totalSides = entry.unilateral ? 2 : 1;
  const [started, setStarted] = useState(false);
  // Mirrors of the phase, kept in React state purely so the component re-renders when the phase
  // engine below (a single setInterval, not React effect-dependency-diffing) advances it — see
  // that effect's own comment for why phase transitions are driven imperatively rather than via
  // `useEffect` deps on another hook's returned snapshot values.
  const [getReadyMs, setGetReadyMs] = useState(3000);
  const [sideIndex, setSideIndex] = useState(0);
  const [switching, setSwitching] = useState(false);
  const [, forceTick] = useState(0);
  // The phase-engine interval below is created once (see its own comment) and so closes over
  // whatever `sideIndex`/`switching` were AT THAT MOMENT — a classic stale-closure trap for a
  // long-lived `setInterval`. These refs are updated in lockstep with the state setters
  // (`setSideIndexLive`/`setSwitchingLive`) so the interval's own callback always reads the
  // current phase, while `sideIndex`/`switching` state still drives re-renders for the JSX below.
  const sideIndexRef = useRef(0);
  const switchingRef = useRef(false);
  const setSideIndexLive = (v: number) => {
    sideIndexRef.current = v;
    setSideIndex(v);
  };
  const setSwitchingLive = (v: boolean) => {
    switchingRef.current = v;
    setSwitching(v);
  };

  const getReadyCountdown = useCountdown(3000);
  // Both instantiated unconditionally (matches this file's existing pattern for get-ready) —
  // `side2Countdown` simply never starts for a bilateral entry (`totalSides === 1`).
  const side1Countdown = useCountdown(durationMs);
  const side2Countdown = useCountdown(durationMs);
  const switchCountdown = useCountdown(SWITCH_SIDE_SEC * 1000);
  const activeCountdown = sideIndex === 0 ? side1Countdown : side2Countdown;

  // Seconds already banked from a fully-completed prior side (only ever side 1, since there are
  // at most two sides) — added to whatever the current/active side contributes.
  const heldSecRef = useRef(0);
  const completedRef = useRef(false); // guards onComplete firing more than once
  // `CountdownController.isRunning()` is `running && !paused` (wallClockTimer.ts) — false while
  // genuinely paused, not just before the first `.start()`. The phase engine below needs to tell
  // "never started" apart from "paused" so it doesn't call `.start()` again on a paused side
  // (which would silently un-pause AND reset it to full duration — a real bug this file used to
  // have, caught by `WorkoutScreen.timedBilateral.test.tsx`'s pause/resume assertion going red).
  const side1StartedRef = useRef(false);
  const side2StartedRef = useRef(false);

  // §10.5 audio+haptic cue bookkeeping — one ref per cue moment so each fires exactly once (or
  // once per second, for the 3-2-1 counts) no matter how many times the phase engine below runs.
  // Fresh on every mount because this whole component remounts per set (`key={entry.id-setIndex}`
  // on the parent). `lastOutCueSecondRef`/`startCueFiredRef` are explicitly reset on the
  // side1->side2 transition so the second side's own start/count-out cues aren't suppressed by
  // side 1's.
  const lastGetReadyCueSecondRef = useRef<number | null>(null);
  const startCueFiredRef = useRef(false);
  const halfwayCueFiredPerSideRef = useRef<[boolean, boolean]>([false, false]);
  const lastOutCueSecondRef = useRef<number | null>(null);
  const completionCueFiredRef = useRef(false);
  const switchCueFiredRef = useRef(false);

  const handleStart = () => {
    setStarted(true);
    getReadyCountdown.controller.start();
  };

  /**
   * §10.5's whole phase machine (get-ready -> side 1 -> [switch interval -> side 2] -> complete),
   * driven by ONE 100ms poll that reads the underlying `.controller`s directly — not by chaining
   * `useEffect`s off `useCountdown`'s returned `isComplete` snapshot. That chained-effects version
   * (this file's first pass) had a real, reproducible bug under real timing pressure: an effect
   * only re-runs when a render actually happens with a changed dependency, and re-renders were
   * left entirely to each `useCountdown` hook's own independent 250ms `forceTick` interval and
   * `getReadyMs`'s 100ms poll — under load (confirmed by running this suite alongside another
   * real-timer-heavy suite, see `WorkoutScreen.timedUnilateral.test.tsx`), those render sources
   * could apparently starve long enough that a side's `isComplete` flip was never observed by the
   * effect that was supposed to react to it, and the exercise got stuck at 0 with no path forward
   * — a real correctness bug, not just a slow test. Reading the controllers' live methods
   * (`.controller.remainingMs()`/`.isComplete()`) directly inside this interval's own callback
   * removes that dependency on React's render scheduling entirely: every 100ms this callback
   * re-evaluates the actual current state and drives whatever transition follows, independent of
   * whether/when React chose to re-render for some other reason.
   */
  useEffect(() => {
    if (!started) return;
    const id = setInterval(() => {
      const readyMs = getReadyCountdown.controller.remainingMs();
      setGetReadyMs(readyMs);
      if (readyMs > 0) {
        forceTick((n) => n + 1);
        return;
      }

      if (sideIndexRef.current === 0 && !switchingRef.current) {
        if (!side1StartedRef.current) {
          side1StartedRef.current = true;
          side1Countdown.controller.start();
        } else if (side1Countdown.controller.isComplete()) {
          if (totalSides === 1) {
            if (!completedRef.current) {
              completedRef.current = true;
              onComplete(entry.durationSec ?? 0, {
                pauseCount: side1Countdown.controller.pauseCount(),
                pausedDurationSec: Math.round(side1Countdown.controller.pausedDurationMs() / 1000),
              });
            }
          } else {
            heldSecRef.current = entry.durationSec ?? 0;
            startCueFiredRef.current = false;
            lastOutCueSecondRef.current = null;
            switchCueFiredRef.current = false;
            switchCountdown.controller.start();
            setSwitchingLive(true);
          }
        }
      } else if (switchingRef.current) {
        if (switchCountdown.controller.isComplete()) {
          setSwitchingLive(false);
          setSideIndexLive(1);
        }
      } else if (sideIndexRef.current === 1) {
        if (!side2StartedRef.current) {
          side2StartedRef.current = true;
          side2Countdown.controller.start();
        } else if (side2Countdown.controller.isComplete() && !completedRef.current) {
          completedRef.current = true;
          onComplete(heldSecRef.current + (entry.durationSec ?? 0), {
            pauseCount:
              side1Countdown.controller.pauseCount() + side2Countdown.controller.pauseCount(),
            pausedDurationSec: Math.round(
              (side1Countdown.controller.pausedDurationMs() +
                side2Countdown.controller.pausedDurationMs()) /
                1000,
            ),
          });
        }
      }
      forceTick((n) => n + 1);
    }, 100);
    return () => clearInterval(id);
    // sideIndex/switching are read via closure but the interval itself is stable for the whole
    // "started" lifetime; re-creating it on every phase change would risk losing a tick right at
    // a transition boundary, which is exactly the class of bug this rewrite exists to remove.
  }, [started]);

  const inGetReady = started && getReadyMs > 0;
  const remainingSeconds = Math.ceil(activeCountdown.remainingMs / 1000);
  const switchRemainingSeconds = Math.ceil(switchCountdown.remainingMs / 1000);

  // §10.5 — "Audio: 3-2-1 count-in; a halfway chime on holds over 45s; 3-2-1 out; a distinct
  // completion tone. Haptics at start, halfway, and completion." Deliberately no deps array —
  // this needs to re-check on every render (the phase engine above forces one every 100ms while
  // running), guarded entirely by the refs above so nothing double-fires.
  useEffect(() => {
    if (!started) return;
    if (inGetReady) {
      const getReadySecond = Math.ceil(getReadyMs / 1000);
      if (
        getReadySecond >= 1 &&
        getReadySecond <= 3 &&
        lastGetReadyCueSecondRef.current !== getReadySecond
      ) {
        lastGetReadyCueSecondRef.current = getReadySecond;
        cueCount(); // count-in
      }
      return;
    }
    if (switching) {
      if (!switchCueFiredRef.current) {
        switchCueFiredRef.current = true;
        cueHalfway(); // reuse the chime as a distinct "switch sides now" cue
      }
      return;
    }
    if (!startCueFiredRef.current) {
      startCueFiredRef.current = true;
      cueStart();
    }
    const totalSec = entry.durationSec ?? 0;
    if (
      totalSec > 45 &&
      !halfwayCueFiredPerSideRef.current[sideIndex] &&
      remainingSeconds <= Math.floor(totalSec / 2)
    ) {
      halfwayCueFiredPerSideRef.current[sideIndex] = true;
      cueHalfway();
    }
    if (
      remainingSeconds >= 1 &&
      remainingSeconds <= 3 &&
      lastOutCueSecondRef.current !== remainingSeconds
    ) {
      lastOutCueSecondRef.current = remainingSeconds;
      cueCount(); // count-out
    }
    if (
      activeCountdown.controller.isComplete() &&
      sideIndex === totalSides - 1 &&
      !completionCueFiredRef.current
    ) {
      completionCueFiredRef.current = true;
      cueCompletion();
    }
  });

  const handleTogglePause = () => {
    if (!started || inGetReady || switching) return;
    if (activeCountdown.controller.isPaused()) activeCountdown.controller.resume();
    else activeCountdown.controller.pause();
  };

  const handleEndEarly = () => {
    const partialHeld = switching
      ? 0
      : Math.max(0, (entry.durationSec ?? 0) - Math.floor(activeCountdown.remainingMs / 1000));
    completedRef.current = true;
    onComplete(heldSecRef.current + partialHeld, {
      pauseCount:
        side1Countdown.controller.pauseCount() +
        (totalSides === 2 ? side2Countdown.controller.pauseCount() : 0),
      pausedDurationSec: Math.round(
        (side1Countdown.controller.pausedDurationMs() +
          (totalSides === 2 ? side2Countdown.controller.pausedDurationMs() : 0)) /
          1000,
      ),
    });
  };

  const canPause = started && !inGetReady && !switching;

  return (
    <View style={styles.hero}>
      <Text style={styles.exerciseName}>{exerciseName}</Text>
      <Text style={styles.setOf}>
        Set {setIndex + 1} of {entry.sets}
        {totalSides === 2 ? ` · Side ${sideIndex + 1} of 2` : ''}
      </Text>

      <View style={styles.circleTimer} testID="timed-circle">
        <Text style={styles.circleTimerText} testID="timed-remaining">
          {!started
            ? 'Tap to start'
            : inGetReady
              ? Math.ceil(getReadyMs / 1000)
              : switching
                ? switchRemainingSeconds
                : remainingSeconds}
        </Text>
      </View>

      {switching && <Text testID="switch-side-label" style={styles.setOf}>{`Switch sides`}</Text>}
      {canPause && activeCountdown.controller.isPaused() && (
        <Text testID="timer-paused-label" style={styles.setOf}>
          Paused
        </Text>
      )}

      {!started ? (
        <Pressable testID="start-timer" style={styles.completeButton} onPress={handleStart}>
          <Text style={styles.completeButtonText}>START</Text>
        </Pressable>
      ) : (
        <>
          {canPause && (
            <Pressable
              testID="pause-resume-timer"
              style={styles.actionButton}
              onPress={handleTogglePause}
            >
              <Text style={styles.actionButtonText}>
                {activeCountdown.controller.isPaused() ? 'Resume' : 'Pause'}
              </Text>
            </Pressable>
          )}
          <Pressable testID="end-early" style={styles.completeButton} onPress={handleEndEarly}>
            <Text style={styles.completeButtonText}>END EARLY</Text>
          </Pressable>
        </>
      )}

      <View style={styles.actionRow}>
        <Pressable testID="swap-set" style={styles.actionButton} onPress={onSwap}>
          <Text style={styles.actionButtonText}>Swap</Text>
        </Pressable>
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
  onExtend,
}: {
  restSec: number;
  nextLabel: string;
  difficulty: Difficulty | null;
  enjoyment: number | null;
  onDifficultyChange: (d: Difficulty | undefined) => void;
  onEnjoymentChange: (e: number | undefined) => void;
  onNext: () => void;
  /** §10.7 — "+15s taps are recorded as a fatigue signal." Called only for +15 (never −15/Skip). */
  onExtend: () => void;
}): React.JSX.Element {
  const countdown = useCountdown(restSec * 1000);
  // §10.7 background rest timer: a local notification scheduled for the moment this rest would
  // hit zero, so the alert still lands if the screen is locked or the app is backgrounded —
  // cancelled and rescheduled whenever the remaining time actually changes, and cancelled outright
  // on unmount/Next/Skip so a stale "rest complete" never fires after the user's moved on.
  const notificationIdRef = useRef<string | null>(null);
  const lastCueSecondRef = useRef<number | null>(null);

  useEffect(() => {
    countdown.controller.start();
    void ensureNotificationPermission();
    let cancelled = false;
    void scheduleRestZeroNotification(restSec, nextLabel).then((id) => {
      if (!cancelled) notificationIdRef.current = id;
    });
    return () => {
      cancelled = true;
      void cancelRestNotification(notificationIdRef.current);
    };
  }, []);

  // §10.7 — "Audio 3-2-1 and a haptic at zero." No deps array: re-checks every render (the same
  // interval tick that drives the visible countdown), guarded by the ref so each second/zero
  // fires exactly once.
  useEffect(() => {
    const remainingSeconds = Math.ceil(countdown.remainingMs / 1000);
    if (
      remainingSeconds >= 1 &&
      remainingSeconds <= 3 &&
      lastCueSecondRef.current !== remainingSeconds
    ) {
      lastCueSecondRef.current = remainingSeconds;
      cueCount();
    } else if (remainingSeconds <= 0 && lastCueSecondRef.current !== 0) {
      lastCueSecondRef.current = 0;
      cueRestZero();
    }
  });

  const handleExtend = async (deltaMs: number) => {
    countdown.controller.addMs(deltaMs);
    if (deltaMs > 0) onExtend(); // fatigue signal — +15s only, never −15s
    await cancelRestNotification(notificationIdRef.current);
    const remainingSeconds = Math.max(0, Math.ceil(countdown.controller.remainingMs() / 1000));
    notificationIdRef.current = await scheduleRestZeroNotification(remainingSeconds, nextLabel);
  };

  const handleSkip = async () => {
    countdown.controller.addMs(-countdown.remainingMs);
    await cancelRestNotification(notificationIdRef.current);
    notificationIdRef.current = null;
  };

  const handleNext = async () => {
    await cancelRestNotification(notificationIdRef.current);
    notificationIdRef.current = null;
    onNext();
  };

  return (
    <View style={styles.hero}>
      <Text style={styles.stage}>Rest</Text>
      <View style={styles.circleTimer} testID="rest-circle">
        <Text style={styles.circleTimerText} testID="rest-remaining">
          {Math.ceil(countdown.remainingMs / 1000)}
        </Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          testID="rest-minus-15"
          style={styles.actionButton}
          onPress={() => handleExtend(-15_000)}
        >
          <Text style={styles.actionButtonText}>−15s</Text>
        </Pressable>
        <Pressable
          testID="rest-plus-15"
          style={styles.actionButton}
          onPress={() => handleExtend(15_000)}
        >
          <Text style={styles.actionButtonText}>+15s</Text>
        </Pressable>
        <Pressable testID="rest-skip" style={styles.actionButton} onPress={handleSkip}>
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

      <Pressable testID="rest-next" style={styles.completeButton} onPress={handleNext}>
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
