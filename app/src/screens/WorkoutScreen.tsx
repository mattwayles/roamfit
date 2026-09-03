/**
 * §10.4/§10.5/§10.7 combined — the active workout loop. One screen (not three navigator routes)
 * so the elapsed-workout timer and rest timer never remount mid-session; phase transitions are
 * local component state, keyed remounts of the sub-view per set so each gets a fresh wall-clock
 * controller (see `useCountdown`/`wallClockTimer.ts`).
 *
 * Every mutation is a `@roamfit/store` call — `logSet`, `recordEntryFeedback`, `setPinnedNote`.
 * Nothing here computes a prescription or decides an exercise; §10.4's hierarchy rule (hero =
 * name + "Set N of M" + the rep/hold target, nothing else at that size; body focus/pattern/
 * difficulty never shown) is honored by simply not reading those fields into the hero view. The
 * rep target itself is no longer a standalone line — it is what the "Reps" picker defaults to and
 * is labelled with, so it does not also get repeated as its own line above the picker.
 *
 * **Remove set** mid-workout has no store mutation to call (only §10.3 approval-time removal
 * exists) — also not implemented. Superset "Round N of M" display is simplified to plain
 * "Set N of M" (group/round math not modeled here for lack of a spec'd source of "M rounds").
 *
 * §10.6 mid-workout swap: `alternativesForSlot` (from `@roamfit/engine`) selects and ranks the
 * candidates and this screen takes the top one — a picker sheet used to sit in between, asking
 * the user to choose between options the engine had already ordered. Swapping calls
 * `sessionsRepo.recordSwap` and reloads — no re-approval, no regeneration, and the session clock
 * is untouched.
 *
 * §10.4 pause: the only thing that stops the session clock, and it stops it for real — the elapsed
 * display and the phase countdowns both freeze, and the pause is persisted on the session row
 * (`pausedAt`/`pausedTotalSec`) so it survives leaving the screen. The workout stays fully on
 * screen and fully editable while paused; only the clocks stop.
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
import {
  exerciseStateRepo,
  progressionStateRepo,
  remoteConfigRepo,
  sessionsRepo,
  usersRepo,
} from '@roamfit/store';
import type { SessionRecord } from '@roamfit/store';
import { alternativesForSlot } from '@roamfit/engine';
import type { BandId } from '@roamfit/engine';
import type { SwapAlternative } from '@roamfit/engine';
import type { Anchor, AnchorClass, Pattern, ProgressionFamilyId } from '@roamfit/data';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { localDateFromDate, nowEngineClock, nowUtcInstant } from '../lib/localClock';
import {
  activeEntries,
  completesSection,
  findCurrentEntry,
  samePosition,
  sectionHasCompletedSet,
  stepPosition,
} from '../lib/sessionProgress';
import type { Section, SessionPosition } from '../lib/sessionProgress';
import { useCountdown } from '../lib/useCountdown';
import type { CountdownController } from '../lib/wallClockTimer';
import AnchorBadge from '../components/AnchorBadge';
import PinnedNote from '../components/PinnedNote';
import FeedbackControls from '../components/FeedbackControls';
import type { Difficulty } from '../components/FeedbackControls';
import BandPicker from '../components/BandPicker';
import DemoMedia from '../components/DemoMedia';
import AbandonSessionButton from '../components/AbandonSessionButton';
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

/**
 * `stage_feedback` is the warm-up/cool-down question, asked once when the stage ends instead of
 * once per exercise inside it. It replaces the rest phase for that one transition — there is no
 * countdown and no rest controls on it, because it is not a rest.
 */
type Phase = 'exercise' | 'resting' | 'stage_feedback';

/** Exactly the arguments `finishSetAndRest` was called with, parked while the paused-timer nudge
 *  is on screen so that answering it either way logs the same set. */
interface PendingCompletion {
  repsActual?: number;
  secondsActual?: number;
  pauseInfo?: { pauseCount: number; pausedDurationSec: number };
}

/** §10.8 crash-safety resume — see `sessionProgress.ts` for the shared implementation (also used
 *  by HomeScreen's abandon action to record §8.3's "abandoned, and at exactly which exercise"). */
function findCurrent(
  session: SessionRecord,
): { entry: sessionsRepo.SessionEntryRecord; setIndex: number } | null {
  return findCurrentEntry(session);
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
  const { db, library, families } = useStore();
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [phase, setPhase] = useState<Phase>('exercise');
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [enjoyment, setEnjoyment] = useState<number | null>(null);
  // §8.1 — which entry the rest screen's feedback controls apply to (the one just performed,
  // not `current`'s post-reload "next up" entry). See the comment in `finishSetAndRest`.
  const [restingEntryId, setRestingEntryId] = useState<string | null>(null);
  /** Which stage the `stage_feedback` page is asking about, or null when it isn't showing. Its
   *  feedback goes to every entry in that stage, not to `restingEntryId`. */
  const [feedbackSection, setFeedbackSection] = useState<Section | null>(null);
  // Same reasoning, for the §10.7 "+15s recorded as a fatigue signal" write: the set just
  // completed, not whatever `current`'s post-reload setIndex points at during the rest phase.
  const [restingSetIndex, setRestingSetIndex] = useState<number | null>(null);
  const setStartedAtRef = useRef<string>(nowUtcInstant());
  /** The band the user picked for the set currently on screen, if they changed it. A ref, not
   *  state: the picker lives inside the (remounting-per-set) hero component, which owns the value
   *  the user sees; this is only here so `finishSetAndRest` can read it at the moment it logs.
   *  Cleared as soon as that set is logged — the next set starts from its own default. */
  const bandUsedRef = useRef<BandId | null>(null);
  const [, forceElapsedTick] = useState(0);
  // §10.6 mid-workout swap — closed by default; opened from the Swap action on either
  // exercise-phase sub-view. Unaffected by pausing/navigating away either way, satisfying "no
  // interruption of the session timer."
  /** One-line result of the last swap. Informational, never blocking. */
  const [swapNotice, setSwapNotice] = useState<string | null>(null);
  /** §1140 — band colours are user data, not a palette this screen invents. */
  const bandTensions = usersRepo.ensureUser(db, nowUtcInstant()).bandTensions;
  /** §10.4 — the pending set completion held back by the "your timer is still paused" nudge, or
   *  null when nothing is waiting. Holding the arguments (not just a flag) is what lets the nudge
   *  be a genuine question: whichever way it is answered, the reps the user already entered are
   *  logged, never re-asked for. */
  const [pausedCompletion, setPausedCompletion] = useState<PendingCompletion | null>(null);
  /** ADR 0009's paste-a-link field is the last thing on this screen, so the keyboard opens
   *  straight over it and over its Save button. `automaticallyAdjustKeyboardInsets` on the
   *  ScrollView makes room to scroll past the keyboard; `handleDemoInputFocus` below then puts the
   *  demo block at the top of what is left visible, so the field, the Save button and any
   *  validation error are all in view while typing. The block's offset is captured on layout
   *  because it moves with the content above it (badges, the "How to" cue, an embed that may or
   *  may not be there). Declared up here with the other hooks, above this screen's loading early
   *  returns, so the hook order is stable across the null-session render. */
  const scrollRef = useRef<ScrollView>(null);
  const demoBlockY = useRef(0);
  /**
   * Where the user has stepped *back* to, or null when they are at the workout's own front edge
   * (§10.8's derived position — the first not-yet-logged set).
   *
   * Moving around the workout must not rewrite it, so this is a view offset held on the screen,
   * never a cursor in the database: the §10.8 resume rule stays "reconstructed purely from
   * set_logs on every read", nothing is deleted to go backwards, and closing the app mid-rewind
   * resumes at the real front edge rather than somewhere the user only looked at.
   */
  const [rewoundTo, setRewoundTo] = useState<SessionPosition | null>(null);

  const reload = useCallback(
    () => setSession(sessionsRepo.getSession(db, sessionId)),
    [db, sessionId],
  );

  useEffect(() => {
    reload();
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

  /** The workout's own front edge: §10.8's derived "first not-yet-logged set". This is what says
   *  whether the workout is finished, regardless of which set the user is currently looking at. */
  const frontier = session ? findCurrent(session) : null;
  /**
   * The set on screen. Normally the front edge; while the user has stepped back with ◂◂ it is the
   * earlier set they moved to. A rewind target that no longer exists (its entry was swapped out
   * from under it, say) silently resolves back to the front edge rather than stranding the screen.
   */
  const rewoundEntry =
    session && rewoundTo ? activeEntries(session).find((e) => e.id === rewoundTo.entryId) : null;
  const current =
    rewoundEntry && rewoundTo && rewoundTo.setIndex < rewoundEntry.sets
      ? { entry: rewoundEntry, setIndex: rewoundTo.setIndex }
      : frontier;
  const entry = current?.entry;
  const exercise = entry ? library.exercises.find((e) => e.id === entry.exerciseId) : undefined;

  useEffect(() => {
    // Keyed on the front edge, not on what is being viewed: the workout is over when every set is
    // logged, and a user who has stepped back to look at an earlier set has not undone that.
    //
    // The cool-down question is the one thing that stands between the last logged set and the
    // summary: its stage ends where the workout does, so without this guard the screen would
    // navigate straight past the page it just opened.
    if (session && !frontier && phase !== 'stage_feedback') {
      navigation.replace('Summary', { sessionId });
    }
  }, [session, frontier, phase, navigation, sessionId]);

  // Hooks must run unconditionally every render — this screen has early `return`s below (loading
  // states) that would otherwise change the hook count between renders (a real bug this track
  // hit while wiring swap: "Rendered more hooks than during the previous render"). Everything
  // that reads `entry`/`exercise` guards internally on them being present instead.
  const swapAlternatives: SwapAlternative[] = useMemo(() => {
    if (!entry) return [];
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
        difficulty: entry.difficulty,
        progressionFamilyId: entry.progressionFamilyId as ProgressionFamilyId | null,
        progressionLevelIdAtTime: entry.progressionLevelIdAtTime,
        pattern: entry.pattern as Pattern,
        anchorClass: entry.anchorClass as AnchorClass,
        unilateral: entry.unilateral,
        estimatedSec: entry.estimatedSec,
      },
      anchorsAvailable: profile.anchorsAvailable,
      limitations: profile.limitations,
      disabledExerciseIds: profile.disabledExerciseIds,
      today: clock.today,
      history: sessionsRepo.getHistoryForGeneration(db),
      exerciseStates: exerciseStateRepo.getAllExerciseStates(db),
      // The sheet's "different anchor point" filter went with it. Auto-swap already avoids the
      // current exercise, and narrowing the pool further without a control to un-narrow it would
      // just make "no alternative fits" more likely.
    });
  }, [entry, exercise, db, library]);

  if (!session) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  // Everything the stage page needs, defined above the guards below because it renders above them
  // — none of it depends on there being a current set, which is exactly the case the cool-down's
  // question runs into.
  // §10.4 "Elapsed workout timer" — the store's `activeElapsedSec` over the already-persisted
  // `startedAt`/`pausedAt`/`pausedTotalSec`, not a component-local stopwatch ref. A local ref
  // silently reset to ~0 on every remount, and a bare `now - startedAt` (what this used to be)
  // kept counting straight through a pause. Deriving from persisted absolute instants is correct
  // across unmount/remount and across suspension for free — the same principle
  // `wallClockTimer.ts` documents for the other timers on this screen — and it is the *same*
  // function completion uses for `actualMinutes`, so the number the user watched is the number
  // that gets recorded.
  const sessionElapsedSec = sessionsRepo.activeElapsedSec(session, nowUtcInstant());

  /** §8.1 stage feedback — one answer, written to every entry in the stage. `null` is "cleared",
   *  which `recordEntryFeedback`'s contract distinguishes from an omitted key. */
  const recordStageAnswer = (feedback: {
    difficulty?: Difficulty | null;
    enjoyment?: number | null;
  }) => {
    if (!feedbackSection) return;
    sessionsRepo.recordSectionFeedback(db, sessionId, feedbackSection, feedback, nowUtcInstant());
  };
  const handleStageDifficulty = (d: Difficulty | undefined) => {
    setDifficulty(d ?? null);
    recordStageAnswer({ difficulty: d ?? null });
  };
  const handleStageEnjoyment = (e: number | undefined) => {
    setEnjoyment(e ?? null);
    recordStageAnswer({ enjoyment: e ?? null });
  };
  /** Leaving a stage page. Disarming `feedbackSection` is what lets the Summary effect through
   *  again, which is how the cool-down page hands off to the end of the workout. */
  const handleStageFeedbackDone = () => {
    setStartedAtRef.current = nowUtcInstant();
    setFeedbackSection(null);
    setPhase('exercise');
    reload();
  };
  /**
   * The stage page renders here, above the "no current set" guard below, because the cool-down's
   * question outlives the workout: it is asked when the last cool-down set is logged, and at that
   * moment every slot in the plan is logged and there is no current entry left for the rest of
   * this screen to build itself around. Rendering it here is what makes one code path serve both
   * stages instead of the warm-up taking one route and the cool-down another.
   *
   * It is deliberately just the question: a seam between two stages carries no exercise, no demo,
   * no set controls. The elapsed clock stays because it is the session's, not the set's.
   */
  if (phase === 'stage_feedback' && feedbackSection) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.elapsed} testID="workout-elapsed">
          {Math.floor(sessionElapsedSec / 60)}m {Math.floor(sessionElapsedSec % 60)}s
        </Text>
        <StageFeedbackPhase
          section={feedbackSection}
          difficulty={difficulty}
          enjoyment={enjoyment}
          onDifficultyChange={handleStageDifficulty}
          onEnjoymentChange={handleStageEnjoyment}
          onDone={handleStageFeedbackDone}
        />
      </ScrollView>
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
  /**
   * Which band this set starts on: whatever the last logged set of this entry actually used, and
   * failing that the prescription. A user who switches to a heavier band on set 1 is not asked
   * again on set 2 — but the switch is still recorded per set, and `entry.band` (the plan) is
   * never rewritten, so planned-vs-actual survives.
   */
  const bandForSet: BandId | null =
    entry.setLogs.filter((s) => s.bandActual != null).sort((a, b) => b.setIndex - a.setIndex)[0]
      ?.bandActual ?? entry.band;
  const exState = exerciseStateRepo.getExerciseState(db, entry.exerciseId);
  const isFirstEverPerformance = !exState || exState.sessionsPerformed === 0;
  const progression = entry.progressionFamilyId
    ? progressionStateRepo.getProgressionState(db, entry.progressionFamilyId)
    : null;

  /**
   * §10.4/§10.8 — "Pause" (workout-level, distinct from the per-set `pause-resume-timer` §10.5
   * control). Both clocks stop: the session's own elapsed timer, via `pauseSession` on the row
   * (see `activeElapsedSec`), and whatever countdown the current phase is running, via the
   * `paused` prop threaded into the hero and rest components.
   *
   * The screen deliberately stays exactly where it was. An earlier pass unmounted the whole
   * active subtree — which did stop the timers, but took the workout off screen with them, so a
   * paused user could not read the next exercise, fix a band, swap or reorder anything. Pausing
   * is for catching your breath in the middle of a workout you are still looking at.
   *
   * Nothing is discarded either way: the session stays `active`, §10.10's pending slot is
   * untouched, and Home's resume card still returns here at the same (entry, setIndex) if the
   * user does navigate away — now with the pause intact, because it lives on the row.
   */
  const paused = session.pausedAt != null;
  const handlePause = () => {
    sessionsRepo.pauseSession(db, sessionId, nowUtcInstant());
    reload();
  };
  const handleResume = () => {
    sessionsRepo.resumeSession(db, sessionId, nowUtcInstant());
    reload();
  };

  /** §10.10 abandon — discards the session entirely via the existing `discardSession` (never a
   *  parallel path), recording exactly which exercise/set the user was on for the §8.3
   *  "abandoned" signal, then returns to Home. Abandoning is not a request to start another
   *  workout (invariant 4 — never punish, never nag): Home is the neutral landing spot, and
   *  generating again is one tap away from there if that is what the user wants. */
  const handleAbandon = () => {
    sessionsRepo.discardSession(
      db,
      sessionId,
      { abandonedEntryId: entry.id, abandonedSetIndex: setIndex },
      nowUtcInstant(),
    );
    navigation.navigate('Home');
  };

  /**
   * §10.6 swap, in one tap. The picker sheet this replaced asked the user to choose between
   * alternatives the engine had *already ranked* — so it was asking them to second-guess a
   * decision they had no more information about than the engine did, mid-set, with a rest timer
   * about to start. Taking the top-ranked candidate is the same answer without the interruption.
   *
   * `alternativesForSlot` is the same call the sheet was fed by (invariant 2: the engine still
   * decides), and its results are already sorted best-first — nearest difficulty, then tier, then
   * the user's own enjoyment. Tapping again simply swaps again, which is the cheap way to reject
   * a suggestion.
   */
  const handleSwap = () => {
    const best = swapAlternatives[0];
    if (!best) {
      setSwapNotice('No alternative fits this slot right now.');
      return;
    }
    sessionsRepo.recordSwap(db, entry.id, best.replacement, setIndex, nowUtcInstant());
    setSwapNotice(`Swapped to ${best.exercise.name}.`);
    reload();
  };

  /**
   * Moving around the workout without training a set: ◂◂ steps back a set, ▸▸ steps forward.
   *
   * Stepping back is pure navigation — nothing is logged and nothing already logged is deleted,
   * so a user who wants another look at the previous exercise (did I really do three sets? what
   * band was that? what did the cue say?) can go and look and come straight back. The set they
   * step back onto keeps whatever log it already has until they train it again, at which point
   * `logSet`'s upsert overwrites that one row — a deliberate redo, never a silent one.
   *
   * ▸▸ therefore means two things, and says which in its accessible name:
   *   - at the front edge (the normal case) it is the §10.5 skip it has always been: the set is
   *     logged as `skipped` and the workout moves straight on to the next one — no rest in
   *     between, see `skipSetAndAdvance`.
   *   - while stepped back it is the mirror of ◂◂, walking forward over sets that are already
   *     logged, and it stops at the front edge rather than skipping past it. Stepping forward
   *     must never *create* skips the user did not ask for.
   */
  const currentPosition: SessionPosition = { entryId: entry.id, setIndex };
  const frontierPosition: SessionPosition | null = frontier
    ? { entryId: frontier.entry.id, setIndex: frontier.setIndex }
    : null;
  const atFrontier = samePosition(currentPosition, frontierPosition);
  const previousPosition = stepPosition(session, currentPosition, -1);

  /** Puts a different set on screen. Landing back on the front edge drops the override entirely,
   *  so the screen returns to deriving its position from `set_logs` (§10.8) instead of holding a
   *  stale copy of it. */
  const moveTo = (position: SessionPosition) => {
    setRewoundTo(samePosition(position, frontierPosition) ? null : position);
    // This set is being started fresh: neither the elapsed-since-started stamp nor a band picked
    // for the set being left behind belongs to it.
    setStartedAtRef.current = nowUtcInstant();
    bandUsedRef.current = null;
    setPhase('exercise');
    setSwapNotice(null);
  };

  const handleRewind = () => {
    if (!previousPosition) return;
    moveTo(previousPosition);
  };

  const handleForward = () => {
    if (atFrontier) {
      skipSetAndAdvance();
      return;
    }
    const next = stepPosition(session, currentPosition, 1);
    if (next) moveTo(next);
  };

  /**
   * §10.5 skip — the set is logged as `skipped` and the screen goes straight to the next set.
   *
   * It deliberately does *not* pass through rest. Rest buys recovery from work that was done, and
   * the rest screen's difficulty/enjoyment controls ask how the set felt; a skipped set was never
   * performed, so there is nothing to recover from and nothing to rate. Sitting a user in front of
   * a countdown for work they explicitly declined is a delay, not a rest.
   *
   * The `skipped` status is what carries this into the record: `summarizeEntry` counts only
   * `completed` sets toward progression, and the summary screen lists the set as skipped rather
   * than as one more finished set. Skipping never stands in for having done it.
   */
  const skipSetAndAdvance = () => {
    logCurrentSet('skipped');
    // Same fresh-set reset `moveTo` does — the next set starts its own clock and picks its own
    // band. `reload()` recomputes the frontier off `set_logs`, which the just-written row has
    // already moved on, so dropping the rewind override lands on the set after this one.
    setStartedAtRef.current = nowUtcInstant();
    setRewoundTo(null);
    setSwapNotice(null);
    // Skipping the last slot still ends the stage, and the stage question is about the stage, not
    // about this set — so a warm-up that was mostly trained still gets asked about even if its
    // final set was waved past. One nobody trained at all does not.
    setPhase(enterStageFeedback('skipped') ? 'stage_feedback' : 'exercise');
    reload();
  };

  /**
   * Warm-up and cool-down are answered once, as a stage, at the moment they end — see
   * `StageFeedbackPhase`. Returns whether that page should now take over, and arms it if so.
   *
   * `main` is not included: its exercises are the workout, they are individually chosen and
   * individually progressed, and their feedback drives `applySessionResult`. It keeps the per-set
   * rest page it has always had.
   */
  const enterStageFeedback = (status: 'completed' | 'skipped'): boolean => {
    const section = completesSection(session, currentPosition);
    if (section !== 'warmup' && section !== 'cooldown') return false;
    // A stage where every single set was skipped is a stage that did not happen. Asking how it
    // felt would be asking about nothing (invariant 4 — never make the user account for a
    // skipped day).
    if (status !== 'completed' && !sectionHasCompletedSet(session, section)) return false;
    setFeedbackSection(section);
    setDifficulty(null);
    setEnjoyment(null);
    return true;
  };

  /**
   * §10.4 — completing a set against a stopped clock is almost always an oversight: the user
   * paused, came back, and started training again without unpausing, so the session's own timer
   * is quietly under-counting the work they are doing.
   *
   * A nudge, not a gate. The set is logged either way and the answer is never assumed — "keep it
   * paused" is a legitimate choice (they really are stopping in a moment), and there is no scold
   * in the copy (invariant 4). Only completions are questioned; skipping a set while paused says
   * nothing about the clock.
   */
  const finishSetAndRest = (
    status: 'completed' | 'skipped',
    repsActual?: number,
    secondsActual?: number,
    pauseInfo?: { pauseCount: number; pausedDurationSec: number },
  ) => {
    if (status === 'completed' && paused) {
      setPausedCompletion({ repsActual, secondsActual, pauseInfo });
      return;
    }
    commitSetAndRest(status, repsActual, secondsActual, pauseInfo);
  };

  /** Writes the row for the set on screen. Shared by the two ways a set ends — trained, or
   *  skipped — because what gets recorded about *this* set is the same question either way; what
   *  differs is only what the screen does next. */
  const logCurrentSet = (
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
        // What was actually picked up for this set, not what was prescribed: whatever the picker
        // was showing when the set ended. Null only for bodyweight work, which has no band to
        // record.
        bandActual: bandForSet != null ? (bandUsedRef.current ?? bandForSet) : null,
        startedAt: setStartedAtRef.current,
        completedAt: nowUtcInstant(),
        restPrescribedSec: entry.restSec,
        pauseCount: pauseInfo?.pauseCount,
        pausedDurationSec: pauseInfo?.pausedDurationSec,
      },
      nowUtcInstant(),
    );
    bandUsedRef.current = null;
  };

  /** The other half of `finishSetAndRest`: everything that happens once a *trained* set is going
   *  to be logged, whether it was questioned first or not. */
  const commitSetAndRest = (
    status: 'completed' | 'skipped',
    repsActual?: number,
    secondsActual?: number,
    pauseInfo?: { pauseCount: number; pausedDurationSec: number },
  ) => {
    logCurrentSet(status, repsActual, secondsActual, pauseInfo);
    // §8.1 — feedback is about the exercise just performed, not whatever `reload()` (called
    // right below) causes `current`/`entry` to recompute to next render (the *upcoming* entry,
    // which is what `nextLabel`'s "Next up" preview correctly wants instead). Captured here,
    // before reload, so the rest screen's feedback controls target the right exercise.
    setRestingEntryId(entry.id);
    setRestingSetIndex(setIndex);
    setDifficulty(null);
    setEnjoyment(null);
    // Finishing a warm-up or cool-down goes to that stage's single question instead of to a rest
    // page — the transition out of the stage is not a rest, and `enterStageFeedback` has already
    // reset the controls for it.
    setPhase(enterStageFeedback(status) ? 'stage_feedback' : 'resting');
    setPausedCompletion(null);
    // A set that has just been trained is done with, whether it was the front edge or one the
    // user had stepped back to redo: drop the view offset so the workout resumes from its own
    // front edge rather than replaying the sets after the one just logged.
    setRewoundTo(null);
    reload();
  };

  /** Answering the paused-timer nudge. Either way the set that was already earned gets logged;
   *  the only question is what happens to the clock. */
  const handlePausedCompletion = (resume: boolean) => {
    const pending = pausedCompletion;
    if (!pending) return;
    if (resume) sessionsRepo.resumeSession(db, sessionId, nowUtcInstant());
    commitSetAndRest('completed', pending.repsActual, pending.secondsActual, pending.pauseInfo);
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
        bandActual: setLog.bandActual,
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
    const localToday = localDateFromDate(new Date());
    exerciseStateRepo.setPinnedNote(
      db,
      entry.exerciseId,
      note.length > 0 ? note : null,
      nowUtcInstant(),
      localToday,
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
    const localToday = localDateFromDate(new Date());
    exerciseStateRepo.reportVideoIssue(
      db,
      entry.exerciseId,
      'user_report',
      nowUtcInstant(),
      localToday,
    );
    reload();
  };
  /** ADR 0009 — persist the user's own video for this exercise, then reload so `DemoMedia` gets
   *  the new id back as a prop and the embed appears immediately, without leaving the set. The
   *  id arrives already parsed and validated by `parseYouTubeVideoId`; the store never sees a
   *  raw URL, so a malformed paste cannot reach the player (invariant 8). */
  const handleAssignVideo = (videoId: string) => {
    exerciseStateRepo.assignUserVideo(
      db,
      entry.exerciseId,
      videoId,
      nowUtcInstant(),
      localDateFromDate(new Date()),
    );
    reload();
  };

  const handleClearVideo = () => {
    exerciseStateRepo.clearUserVideo(db, entry.exerciseId, nowUtcInstant());
    reload();
  };

  const handleDemoInputFocus = () => {
    scrollRef.current?.scrollTo({ y: Math.max(demoBlockY.current - 8, 0), animated: true });
  };

  const handleDemoPlayerError = () => {
    const localToday = localDateFromDate(new Date());
    exerciseStateRepo.reportVideoIssue(
      db,
      entry.exerciseId,
      'player_error',
      nowUtcInstant(),
      localToday,
    );
    reload();
  };

  /** The stage the rest page belongs to — read off the entry just performed, not off `entry`,
   *  which `reload()` has already advanced to the next one by the time rest is on screen. */
  const restingSection: Section | null =
    (activeEntries(session).find((e) => e.id === restingEntryId)?.section as Section | undefined) ??
    null;

  /**
   * One write path for both feedback pages. On the rest page the answer is about the one exercise
   * just performed; on a stage page it is about the whole warm-up or cool-down, and goes to every
   * entry in it (see `recordSectionFeedback` for why that is stored per entry rather than as a new
   * stage-level column).
   *
   * `null` here means "the user just cleared it", which is different from omitting the key — see
   * `recordEntryFeedback`'s contract.
   */
  const recordFeedback = (feedback: {
    difficulty?: Difficulty | null;
    enjoyment?: number | null;
  }) => {
    if (feedbackSection) {
      recordStageAnswer(feedback);
      return;
    }
    sessionsRepo.recordEntryFeedback(db, restingEntryId ?? entry.id, feedback, nowUtcInstant());
  };

  const handleDifficultyChange = (d: Difficulty | undefined) => {
    setDifficulty(d ?? null);
    recordFeedback({ difficulty: d ?? null });
  };
  const handleEnjoymentChange = (e: number | undefined) => {
    setEnjoyment(e ?? null);
    recordFeedback({ enjoyment: e ?? null });
  };

  return (
    <ScrollView
      ref={scrollRef}
      testID="workout-scroll"
      contentContainerStyle={styles.container}
      // Without this a tap on Save while the keyboard is up is spent dismissing the keyboard, so
      // the paste has to be confirmed twice.
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      {/* The elapsed clock is the single biggest thing on this page: it is what a user mid-set,
          at arm's length, glances at most often, so it gets the top line and the largest type
          rather than sharing space with a label. Pause/stop ride the same line, right-justified,
          so the whole header costs one row instead of three — real estate the exercise hero
          below needs more than a caption does. A flex-1 spacer on the left balances the flex-1
          actions group on the right so the timer stays visually centered — which is also why
          there is no "Elapsed" prefix on the clock text itself: the actions group has a real
          minimum width (two icon buttons) the empty spacer does not, so on a narrow screen a
          wider clock text ate into the spacer's share first and dragged the timer off-center. */}
      <View style={styles.timerRow}>
        <View style={styles.timerRowSpacer} />
        <Text style={styles.elapsed} testID="workout-elapsed">
          {Math.floor(sessionElapsedSec / 60)}m {Math.floor(sessionElapsedSec % 60)}s
        </Text>
        <View style={[styles.timerRowSpacer, styles.timerRowActions]}>
          <Pressable
            testID="pause-workout"
            accessibilityRole="button"
            accessibilityLabel={paused ? 'Resume workout' : 'Pause workout'}
            style={styles.sessionIconButton}
            onPress={paused ? handleResume : handlePause}
          >
            <Text style={styles.sessionIconText}>{paused ? '▶' : '❚❚'}</Text>
          </Pressable>
          <AbandonSessionButton onConfirm={handleAbandon} variant="icon" />
        </View>
      </View>
      <Text style={styles.stage}>{entry.section}</Text>

      {swapNotice != null && (
        <Text testID="swap-notice" style={styles.swapNotice}>
          {swapNotice}
        </Text>
      )}

      {paused && (
        <Text testID="workout-paused-banner" style={styles.pausedBanner}>
          Paused — the clock is stopped. Take as long as you need.
        </Text>
      )}

      {/* §10.4 — the gentle nudge, in the two-step-confirm shape this app uses everywhere else
          rather than a system alert. Neither answer is the "wrong" one, and the set is logged
          whichever is chosen, so nothing here reads as a warning. */}
      {pausedCompletion != null && (
        <View style={styles.pausedNudge} testID="paused-completion-nudge">
          <Text style={styles.pausedNudgeText}>Your timer is still paused. Want to resume it?</Text>
          <View style={styles.pausedNudgeButtons}>
            <Pressable
              testID="paused-completion-stay-paused"
              accessibilityRole="button"
              style={styles.pausedNudgeSecondary}
              onPress={() => handlePausedCompletion(false)}
            >
              <Text style={styles.pausedNudgeSecondaryText}>Stay paused</Text>
            </Pressable>
            <Pressable
              testID="paused-completion-resume"
              accessibilityRole="button"
              style={styles.pausedNudgePrimary}
              onPress={() => handlePausedCompletion(true)}
            >
              <Text style={styles.pausedNudgePrimaryText}>Resume timer</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* The user's own note about this exercise, above the exercise itself: it is the thing
          they wrote down *because* they wanted to see it before doing the movement again. */}
      <PinnedNote note={exState?.pinnedNote ?? null} onChange={handlePinnedNoteChange} />

      {phase === 'exercise' ? (
        entry.durationSec != null ? (
          <TimedExercise
            key={`${entry.id}-${setIndex}`}
            entry={entry}
            exerciseName={exercise?.name ?? entry.exerciseId}
            anchor={exercise?.anchor ?? null}
            anchorAlt={exercise?.anchor_alt ?? null}
            band={bandForSet}
            bandTensions={bandTensions}
            onBandChange={(b) => (bandUsedRef.current = b)}
            paused={paused}
            setIndex={setIndex}
            onComplete={(actualSeconds, pauseInfo) =>
              finishSetAndRest('completed', undefined, actualSeconds, pauseInfo)
            }
            onSkip={handleForward}
            onSwap={handleSwap}
            onRewind={previousPosition ? handleRewind : null}
            forwardIsSkip={atFrontier}
          />
        ) : (
          <RepsExercise
            key={`${entry.id}-${setIndex}`}
            entry={entry}
            exerciseName={exercise?.name ?? entry.exerciseId}
            anchor={exercise?.anchor ?? null}
            anchorAlt={exercise?.anchor_alt ?? null}
            band={bandForSet}
            bandTensions={bandTensions}
            onBandChange={(b) => (bandUsedRef.current = b)}
            paused={paused}
            setIndex={setIndex}
            onComplete={(reps) => finishSetAndRest('completed', reps)}
            onSkip={handleForward}
            onSwap={handleSwap}
            onRewind={previousPosition ? handleRewind : null}
            forwardIsSkip={atFrontier}
          />
        )
      ) : (
        <RestPhase
          key={`rest-${entry.id}-${setIndex}`}
          restSec={entry.restSec}
          nextLabel={`${exercise?.name ?? entry.exerciseId} · set ${setIndex + 1} of ${entry.sets}`}
          // Rest is exactly when a user would go and rig the next anchor, so the requirement is
          // worth naming before the set rather than at the top of it. `exercise` is already the
          // *upcoming* entry here — same post-reload reasoning `nextLabel` relies on.
          nextAnchor={exercise?.anchor ?? null}
          nextAnchorAlt={exercise?.anchor_alt ?? null}
          paused={paused}
          // §8.1 — warm-up and cool-down are asked about once per stage, on their own page, so
          // their rest pages carry no controls. `main` keeps its per-exercise question: those
          // exercises are individually progressed off exactly this answer.
          showFeedback={restingSection === 'main'}
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

          {/* Above the demo, and open by default every time — not only on a first-ever
              performance. Since ADR 0008 removed the bundled figures this cue IS the offline
              demo, so it is the one thing that must never need a tap to reach; and a user who
              has done a movement fifty times still checks their setup. */}
          <Disclosure title="How to" defaultOpen body={exercise?.setup ?? ''} />

          {exercise && (
            <View
              testID="demo-media-block"
              onLayout={(e) => {
                demoBlockY.current = e.nativeEvent.layout.y;
              }}
            >
              <DemoMedia
                videoSearchQuery={exercise.video_search}
                // §11.4 — a synchronous local read of whatever `sync/firestoreSyncWorker.ts` last
                // pulled into `remote_video_config` (track 6d). Null (never bundled, invariant 8)
                // until a delta pull has actually resolved a curated id for this exercise, in
                // which case `DemoMedia` renders nothing and the "How to" cue below is the demo.
                curatedVideoId={remoteConfigRepo.getCuratedVideoId(db, exercise.id)}
                videoDemoted={videoFlagState.demoted}
                defaultOpen={isFirstEverPerformance}
                userVideoId={exerciseStateRepo.getUserVideoId(db, exercise.id)}
                onAssignVideo={handleAssignVideo}
                onClearVideo={handleClearVideo}
                onExpand={handleDemoExpand}
                onReportIssue={handleReportVideoIssue}
                onPlayerError={handleDemoPlayerError}
                onInputFocus={handleDemoInputFocus}
              />
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function RepsExercise({
  entry,
  exerciseName,
  anchor,
  anchorAlt,
  band,
  bandTensions,
  onBandChange,
  paused,
  setIndex,
  onComplete,
  onSkip,
  onSwap,
  onRewind,
  forwardIsSkip,
}: {
  entry: sessionsRepo.SessionEntryRecord;
  exerciseName: string;
  /** What this exercise attaches to, for `AnchorBadge` — null for anything self-anchored, which
   *  renders nothing. Read off the library record, not the entry: the plan stores `anchorClass`
   *  (the §13.1 safety bucket), not the specific fixed point the user has to go and find. */
  anchor: Anchor | null;
  /** A second fixed point that works equally well (`Exercise.anchor_alt`) — the user should see
   *  every safe option while they're the one deciding what to rig, not just the first one. */
  anchorAlt: Anchor | null;
  /** The band this set starts on — the prescription, or whatever the last set actually used. */
  band: BandId | null;
  /** The user's own band colours/labels (spec §1140), for `BandPicker`. */
  bandTensions: Record<BandId, usersRepo.BandTension>;
  onBandChange: (band: BandId) => void;
  /** Session-level pause. Nothing here runs on a clock, so this only shows the state — the set
   *  stays fully usable, which is the point of not hiding the workout while paused. */
  paused: boolean;
  setIndex: number;
  onComplete: (reps: number) => void;
  /** The forward control: skips this set at the front edge, steps forward over an already-logged
   *  one while the user has stepped back. See `SetNavRow`. */
  onSkip: () => void;
  onSwap: () => void;
  /** Step back a set, or null on the workout's first set. */
  onRewind: (() => void) | null;
  forwardIsSkip: boolean;
}): React.JSX.Element {
  const [reps, setReps] = useState(entry.repTarget ?? 0);
  // Remounted per set (the caller keys on entry+setIndex), so this resets to the incoming default
  // each set without any explicit clearing.
  const [bandUsed, setBandUsed] = useState(band);
  return (
    // Tinted, not hidden or disabled, while the session clock is stopped: the state is legible at
    // a glance and every control still works.
    <View style={[styles.hero, paused && styles.heroPaused]}>
      <Text testID="exercise-name" style={styles.exerciseName}>
        {exerciseName}
      </Text>
      {/* What the band goes on, right under what the exercise is — the two setup facts a user
          reads before they pick anything up, together. */}
      <AnchorBadge anchor={anchor} anchorAlt={anchorAlt} />
      {/* Which band to actually pick up, mid-set, without leaving this screen — and, if that is
          not the one in your hand, which one you really used. */}
      {bandUsed != null && (
        <View style={styles.bandRow}>
          <BandPicker
            band={bandUsed}
            tensions={bandTensions}
            accessibilityLabel="Band used for this set"
            onChange={(b) => {
              setBandUsed(b);
              onBandChange(b);
            }}
          />
        </View>
      )}
      <Text style={styles.setOf}>
        Set {setIndex + 1} of {entry.sets}
      </Text>

      {/* The target rep count used to repeat here as its own "N reps" line — the same number the
          picker below already shows (it defaults to the prescription), so the two just echoed
          each other. A "Reps" label on the picker itself says what the number means without a
          second line saying it again. */}
      <Text style={styles.repCounterLabel}>Reps</Text>
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

      <SetNavRow
        onRewind={onRewind}
        onSwap={onSwap}
        onSkip={onSkip}
        forwardIsSkip={forwardIsSkip}
      />
    </View>
  );
}

/**
 * The set's own controls: step back, swap, step forward. Shared by both hero views (reps and
 * timed) because they had drifted into two identical copies of this row.
 *
 * Same treatment as the session-level Pause/Abandon controls: found mid-set, at arm's length, so
 * targets rather than sentences. The accessible names carry the meaning — including which of its
 * two jobs ▸▸ is doing right now — and ⇄ is the same glyph the approval card uses for swap.
 */
function SetNavRow({
  onRewind,
  onSwap,
  onSkip,
  forwardIsSkip,
}: {
  /** Null on the workout's very first set, where there is nothing behind to step back to. The
   *  button stays in place, greyed: the row does not reshuffle under a thumb already reaching
   *  for swap. */
  onRewind: (() => void) | null;
  onSwap: () => void;
  onSkip: () => void;
  /** True at the workout's front edge, where ▸▸ skips the set; false while stepped back, where it
   *  just walks forward over sets that are already logged. */
  forwardIsSkip: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.actionRow}>
      <Pressable
        testID="rewind-set"
        accessibilityRole="button"
        accessibilityLabel="Go back to the previous set"
        accessibilityState={{ disabled: onRewind === null }}
        style={[styles.heroIconButton, onRewind === null && styles.heroIconButtonDisabled]}
        disabled={onRewind === null}
        onPress={() => onRewind?.()}
      >
        <Text style={[styles.heroIconText, onRewind === null && styles.heroIconTextDisabled]}>
          ◂◂
        </Text>
      </Pressable>
      <Pressable
        testID="swap-set"
        accessibilityRole="button"
        accessibilityLabel="Swap this exercise for another"
        style={[styles.heroIconButton, styles.heroSwapButton]}
        onPress={onSwap}
      >
        <Text style={[styles.heroIconText, styles.heroSwapText]}>⇄</Text>
      </Pressable>
      <Pressable
        testID="skip-set"
        accessibilityRole="button"
        accessibilityLabel={forwardIsSkip ? 'Skip this set' : 'Go forward to the next set'}
        style={styles.heroIconButton}
        onPress={onSkip}
      >
        <Text style={styles.heroIconText}>▸▸</Text>
      </Pressable>
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
  anchor,
  anchorAlt,
  setIndex,
  onComplete,
  onSkip,
  band,
  bandTensions,
  onBandChange,
  paused,
  onSwap,
  onRewind,
  forwardIsSkip,
}: {
  entry: sessionsRepo.SessionEntryRecord;
  exerciseName: string;
  /** What this exercise attaches to, for `AnchorBadge` — null for anything self-anchored, which
   *  renders nothing. Read off the library record, not the entry: the plan stores `anchorClass`
   *  (the §13.1 safety bucket), not the specific fixed point the user has to go and find. */
  anchor: Anchor | null;
  /** A second fixed point that works equally well (`Exercise.anchor_alt`) — the user should see
   *  every safe option while they're the one deciding what to rig, not just the first one. */
  anchorAlt: Anchor | null;
  setIndex: number;
  /** §10.5 — "actual seconds held are recorded," summed across both sides for unilateral work.
   *  `pauseInfo` is the §8.3 pause signal (`set_logs.pause_count`/`paused_duration_sec`), also
   *  summed across sides. */
  /** The band this set starts on — the prescription, or whatever the last set actually used. */
  band: BandId | null;
  /** The user's own band colours/labels (spec §1140), for `BandPicker`. */
  bandTensions: Record<BandId, usersRepo.BandTension>;
  onBandChange: (band: BandId) => void;
  /** Session-level pause. Unlike the reps view this one really is on a clock, so pausing the
   *  session has to stop the hold countdown too — otherwise "paused" would still run the set out
   *  underneath the user. */
  paused: boolean;
  onComplete: (actualSeconds: number, pauseInfo: PauseInfo) => void;
  /** The forward control: skips this set at the front edge, steps forward over an already-logged
   *  one while the user has stepped back. See `SetNavRow`. */
  onSkip: () => void;
  onSwap: () => void;
  /** Step back a set, or null on the workout's first set. */
  onRewind: (() => void) | null;
  forwardIsSkip: boolean;
}): React.JSX.Element {
  // The prescription, fixed for the life of this mounted set. `durationSec` below is the
  // (possibly user-adjusted) hold length actually used; the two are only ever different between
  // mount and the moment `handleStart` is pressed, while the ±5s buttons are live.
  const originalDurationSec = entry.durationSec ?? 0;
  const durationMs = originalDurationSec * 1000;
  // §10.5 — "unilateral timed work runs two sequential timers with a short switch-side interval
  // between them." `sideIndex` is 0 for the only side (bilateral) or the first side
  // (unilateral), 1 for a unilateral exercise's second side.
  const totalSides = entry.unilateral ? 2 : 1;
  const [started, setStarted] = useState(false);
  /** Adjustable, in 5s steps, only before the hold starts — the ±5s buttons flanking the
   *  "tap to start" ring. `useCountdown`'s controllers are created once with `durationMs` above
   *  (see its own header comment) and never rebuilt when this changes; `handleStart` instead
   *  reconciles the two by `addMs`-ing the difference onto each side's controller the moment it
   *  starts, which is also why this is read (not re-derived) after that point. */
  const [durationSec, setDurationSec] = useState(originalDurationSec);
  // Remounted per set (the caller keys on entry+setIndex), so this resets to the incoming default
  // each set without any explicit clearing.
  const [bandUsed, setBandUsed] = useState(band);
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
  // Read by the phase engine's own interval callback, which is created once and would otherwise
  // close over the very first `paused` value forever — the same stale-closure trap the
  // sideIndex/switching refs above exist for.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

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

  /** The ±5s adjust buttons, live only before the hold starts (mirrors §10.7's rest ±extend
   *  shape, applied here to the hold itself rather than the rest after it). Floored at 5s — a
   *  0s or negative hold isn't a hold. */
  const adjustDuration = (deltaSec: number) => {
    if (started) return;
    setDurationSec((s) => Math.max(5, s + deltaSec));
  };
  /** The gap between the (possibly adjusted) hold and the prescription each side's controller
   *  was actually built with — applied via `addMs` the instant a side starts, since the
   *  controller's own total is fixed at creation (see `durationSec`'s comment above). */
  const durationAdjustMs = (durationSec - originalDurationSec) * 1000;

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
      // While the session is paused every countdown below is frozen, so no phase transition can
      // legitimately be due — and starting the next one here would silently un-freeze it (the
      // controllers' `start()` resets to full duration). Nothing advances until resume.
      if (pausedRef.current) return;
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
          if (durationAdjustMs !== 0) side1Countdown.controller.addMs(durationAdjustMs);
        } else if (side1Countdown.controller.isComplete()) {
          if (totalSides === 1) {
            if (!completedRef.current) {
              completedRef.current = true;
              onComplete(durationSec, {
                pauseCount: side1Countdown.controller.pauseCount(),
                pausedDurationSec: Math.round(side1Countdown.controller.pausedDurationMs() / 1000),
              });
            }
          } else {
            heldSecRef.current = durationSec;
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
          if (durationAdjustMs !== 0) side2Countdown.controller.addMs(durationAdjustMs);
        } else if (side2Countdown.controller.isComplete() && !completedRef.current) {
          completedRef.current = true;
          onComplete(heldSecRef.current + durationSec, {
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

  /**
   * §10.4 — the session pause, applied to whichever countdown this set is actually running.
   *
   * Every controller is pause/resume-idempotent (`pause()` no-ops unless running-and-not-paused,
   * `resume()` unless paused), so blanket-calling all four is correct and avoids having to
   * reason here about which phase is live.
   *
   * One deliberate asymmetry on resume: a countdown the user paused *themselves* with the per-set
   * `pause-resume-timer` control must stay paused. `pausedBySessionRef` records only the ones this
   * effect paused, so resuming the session never overrides that choice.
   */
  const pausedBySessionRef = useRef<CountdownController[]>([]);
  useEffect(() => {
    const all = [
      getReadyCountdown.controller,
      side1Countdown.controller,
      side2Countdown.controller,
      switchCountdown.controller,
    ];
    if (paused) {
      pausedBySessionRef.current = all.filter((c) => c.isRunning());
      for (const c of pausedBySessionRef.current) c.pause();
    } else {
      for (const c of pausedBySessionRef.current) c.resume();
      pausedBySessionRef.current = [];
    }
  }, [paused]);

  const inGetReady = started && getReadyMs > 0;
  const remainingSeconds = Math.ceil(activeCountdown.remainingMs / 1000);
  const switchRemainingSeconds = Math.ceil(switchCountdown.remainingMs / 1000);

  // §10.5 — "Audio: 3-2-1 count-in; a halfway chime on holds over 45s; 3-2-1 out; a distinct
  // completion tone. Haptics at start, halfway, and completion." Deliberately no deps array —
  // this needs to re-check on every render (the phase engine above forces one every 100ms while
  // running), guarded entirely by the refs above so nothing double-fires.
  useEffect(() => {
    if (!started) return;
    // A frozen clock makes no sound: no count-in, no halfway chime, no count-out while paused.
    if (paused) return;
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
    const totalSec = durationSec;
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
      : Math.max(0, durationSec - Math.floor(activeCountdown.remainingMs / 1000));
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

  /**
   * The timer *is* the control. It used to be a 200pt ring that did nothing, with a stack of
   * START / Pause / END EARLY buttons underneath doing the actual work — and the ring's own label
   * read "Tap to start", which was a lie about a button that wasn't there. The word wrapped to two
   * lines in the 44pt countdown face and spilled straight through the stroke on both sides.
   *
   * So the ring does what it always said it did: tap to start, tap to pause, tap to resume. It is
   * the biggest target on the screen, which is what a control found mid-hold at arm's length
   * wants to be, and the three buttons are gone.
   *
   * The hold itself is on screen (as opposed to the get-ready count-in or the switch-sides gap).
   */
  const inHold = started && !inGetReady && !switching;
  // The per-set pause is meaningless while the whole session is paused — the countdown is already
  // stopped, and "Resume" here would resume it against a stopped session clock. So the ring goes
  // inert rather than offering a resume that would desync the two clocks.
  const canPause = inHold && !paused;
  const selfPaused = canPause && activeCountdown.controller.isPaused();

  /** What a tap means right now — `null` during the two transitions and while the session is
   *  paused, where there is nothing for it to start or stop. */
  const tapAction: 'start' | 'toggle' | null = !started ? 'start' : canPause ? 'toggle' : null;

  const handleCirclePress = () => {
    if (tapAction === 'start') handleStart();
    else if (tapAction === 'toggle') handleTogglePause();
  };

  /** The number in the middle. Before the start it is the prescription — how long this hold is,
   *  adjustable by the ±5s buttons — which is worth knowing before committing to it, and it
   *  counts down from exactly there. */
  const circleValue = !started
    ? durationSec
    : inGetReady
      ? Math.ceil(getReadyMs / 1000)
      : switching
        ? switchRemainingSeconds
        : remainingSeconds;

  /** A bare number on the ring reads as ambiguous — reps, a set count, seconds? — so the
   *  prescription and the running hold (the two states where the number really is "how long")
   *  get a small unit label. Get-ready and switch-side are left alone: they are always a couple
   *  of seconds, already captioned ("Get ready"/"Switch sides"), and a unit label on them would
   *  just be noise. The ±5s buttons have no upper bound, so past a minute the number itself
   *  switches to M:SS — a bare "125" is harder to read at a glance than "2:05". */
  const ringIsDuration = !started || inHold;
  const ringUnit = ringIsDuration ? (circleValue >= 60 ? 'min' : 'sec') : null;
  const ringDisplay =
    ringIsDuration && circleValue >= 60
      ? `${Math.floor(circleValue / 60)}:${String(circleValue % 60).padStart(2, '0')}`
      : circleValue;

  // Short enough to sit inside a 216pt ring on one line, at every phase.
  const circleCaption = !started
    ? 'Tap to start'
    : inGetReady
      ? 'Get ready'
      : switching
        ? 'Switch sides'
        : paused
          ? 'Workout paused'
          : selfPaused
            ? 'Tap to resume'
            : 'Tap to pause';

  const circleLabel = !started
    ? `Start this ${durationSec} second hold`
    : inGetReady
      ? 'Getting ready'
      : switching
        ? 'Switch sides'
        : paused
          ? 'Workout paused'
          : selfPaused
            ? 'Resume the hold'
            : 'Pause the hold';

  return (
    <View style={[styles.hero, paused && styles.heroPaused]}>
      <Text testID="exercise-name" style={styles.exerciseName}>
        {exerciseName}
      </Text>
      {/* What the band goes on, right under what the exercise is — the two setup facts a user
          reads before they pick anything up, together. */}
      <AnchorBadge anchor={anchor} anchorAlt={anchorAlt} />
      {/* Which band to actually pick up, mid-set, without leaving this screen — and, if that is
          not the one in your hand, which one you really used. */}
      {bandUsed != null && (
        <View style={styles.bandRow}>
          <BandPicker
            band={bandUsed}
            tensions={bandTensions}
            accessibilityLabel="Band used for this set"
            onChange={(b) => {
              setBandUsed(b);
              onBandChange(b);
            }}
          />
        </View>
      )}
      <Text style={styles.setOf}>
        Set {setIndex + 1} of {entry.sets}
        {totalSides === 2 ? ` · Side ${sideIndex + 1} of 2` : ''}
      </Text>

      <View style={styles.circleRow}>
        {/* Live only before the hold starts — once it is running, the ring itself is the
            control (tap to pause/resume), and there is nothing left here to adjust. */}
        {!started && (
          <Pressable
            testID="duration-minus"
            accessibilityRole="button"
            accessibilityLabel="Decrease hold time by 5 seconds"
            style={styles.repAdjustButton}
            onPress={() => adjustDuration(-5)}
          >
            <Text style={styles.repAdjustText}>−</Text>
          </Pressable>
        )}
        <Pressable
          testID="timed-circle"
          accessibilityRole="button"
          accessibilityLabel={circleLabel}
          accessibilityHint={started ? 'Press and hold to end this hold early' : undefined}
          onPress={handleCirclePress}
          // Ending early is a real, recorded outcome — it logs the seconds actually held — so it
          // stays reachable at every phase the END EARLY button covered, including while the
          // session is paused. A long press keeps it off the screen without taking it away.
          onLongPress={started ? handleEndEarly : undefined}
          style={({ pressed }) => [
            styles.circleTimer,
            (selfPaused || paused) && styles.circleTimerStopped,
            pressed && tapAction !== null && styles.circleTimerPressed,
          ]}
        >
          <Text
            testID="timed-remaining"
            style={[
              styles.circleTimerText,
              (selfPaused || paused) && styles.circleTimerTextStopped,
            ]}
          >
            {ringDisplay}
          </Text>
          {ringUnit != null && (
            <Text
              testID="timed-remaining-unit"
              style={[styles.circleUnit, (selfPaused || paused) && styles.circleCaptionStopped]}
            >
              {ringUnit}
            </Text>
          )}
          <Text
            testID="timed-caption"
            style={[styles.circleCaption, (selfPaused || paused) && styles.circleCaptionStopped]}
          >
            {circleCaption}
          </Text>
        </Pressable>
        {!started && (
          <Pressable
            testID="duration-plus"
            accessibilityRole="button"
            accessibilityLabel="Increase hold time by 5 seconds"
            style={styles.repAdjustButton}
            onPress={() => adjustDuration(5)}
          >
            <Text style={styles.repAdjustText}>+</Text>
          </Pressable>
        )}
      </View>

      {/* The one thing a tap cannot say. Quiet, and only once there is a hold to end. */}
      {inHold && (
        <Text testID="end-early-hint" style={styles.circleHint}>
          Press and hold to end early
        </Text>
      )}

      <SetNavRow
        onRewind={onRewind}
        onSwap={onSwap}
        onSkip={onSkip}
        forwardIsSkip={forwardIsSkip}
      />
    </View>
  );
}

function RestPhase({
  restSec,
  nextLabel,
  nextAnchor,
  nextAnchorAlt,
  paused,
  showFeedback,
  difficulty,
  enjoyment,
  onDifficultyChange,
  onEnjoymentChange,
  onNext,
  onExtend,
}: {
  restSec: number;
  nextLabel: string;
  /** The fixed point the *next* exercise needs, or null when it needs none. */
  nextAnchor: Anchor | null;
  /** A second fixed point the next exercise works equally well from (`Exercise.anchor_alt`). */
  nextAnchorAlt: Anchor | null;
  /** Session-level pause. Stops the rest countdown, and — since the background "rest complete"
   *  notification is scheduled against wall-clock time the OS owns, not against this countdown —
   *  cancels that too, rescheduling for whatever is left when the session resumes. */
  paused: boolean;
  /** §8.1 — whether this rest asks about the exercise just performed. True only in `main`:
   *  warm-up and cool-down are asked about once per stage instead, on `StageFeedbackPhase`. */
  showFeedback: boolean;
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

  // §10.4 — the session pause, applied to the rest clock. The scheduled notification has to go
  // with it: it is an absolute-time alarm held by the OS, so leaving it in place would announce
  // "rest complete" while the rest is still frozen. Skipped on the first run (nothing is paused
  // yet, and the mount effect above owns the initial schedule).
  const wasPausedRef = useRef(false);
  useEffect(() => {
    if (paused === wasPausedRef.current) return;
    wasPausedRef.current = paused;
    if (paused) {
      countdown.controller.pause();
      void cancelRestNotification(notificationIdRef.current);
      notificationIdRef.current = null;
    } else {
      countdown.controller.resume();
      const remainingSeconds = Math.max(0, Math.ceil(countdown.controller.remainingMs() / 1000));
      void scheduleRestZeroNotification(remainingSeconds, nextLabel).then((id) => {
        notificationIdRef.current = id;
      });
    }
  }, [paused]);

  // §10.7 — "Audio 3-2-1 and a haptic at zero." No deps array: re-checks every render (the same
  // interval tick that drives the visible countdown), guarded by the ref so each second/zero
  // fires exactly once.
  useEffect(() => {
    if (paused) return; // a frozen clock counts nobody down
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
      {/* Same ring, deliberately without the lift: rest counts itself down and nothing here is
          pressable, so it should not look like the set timer, which is. */}
      <View style={[styles.circleTimer, styles.circleTimerFlat]} testID="rest-circle">
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
      <AnchorBadge anchor={nextAnchor} anchorAlt={nextAnchorAlt} testID="rest-next-anchor" />

      {showFeedback && (
        <FeedbackControls
          difficulty={difficulty}
          enjoyment={enjoyment}
          onDifficultyChange={onDifficultyChange}
          onEnjoymentChange={onEnjoymentChange}
        />
      )}

      <Pressable testID="rest-next" style={styles.completeButton} onPress={handleNext}>
        <Text style={styles.completeButtonText}>NEXT</Text>
      </Pressable>
    </View>
  );
}

/**
 * §8.1 — one question for a whole stage, shown once when the warm-up or the cool-down ends.
 *
 * It replaced a page per exercise. A six-exercise warm-up meant six rest pages each asking how
 * that one mobility drill felt, which is more accounting than a warm-up is worth and more than the
 * answers were: nobody rates a leg swing on its own. A stage is done as one block and judged as
 * one block, so it is asked about as one block, and the answer lands on every exercise in it.
 *
 * There is no countdown and no −15/+15/Skip row, because this is not a rest — it is the seam
 * between two stages. The one control is the way out, and both questions stay optional: leaving
 * without answering is a complete, unpunished answer (invariant 4).
 */
function StageFeedbackPhase({
  section,
  difficulty,
  enjoyment,
  onDifficultyChange,
  onEnjoymentChange,
  onDone,
}: {
  section: Section;
  difficulty: Difficulty | null;
  enjoyment: number | null;
  onDifficultyChange: (d: Difficulty | undefined) => void;
  onEnjoymentChange: (e: number | undefined) => void;
  onDone: () => void;
}): React.JSX.Element {
  const label = section === 'warmup' ? 'warm-up' : 'cool-down';
  return (
    <View style={styles.stageFeedback} testID="stage-feedback">
      <Text style={styles.stageFeedbackEyebrow}>{label} complete</Text>
      <Text style={styles.stageFeedbackTitle} testID="stage-feedback-title">
        How was the {label}?
      </Text>
      <Text style={styles.stageFeedbackSubtitle}>Optional — one answer for the whole {label}.</Text>

      <FeedbackControls
        difficulty={difficulty}
        enjoyment={enjoyment}
        onDifficultyChange={onDifficultyChange}
        onEnjoymentChange={onEnjoymentChange}
      />

      <Pressable testID="stage-feedback-done" style={styles.completeButton} onPress={onDone}>
        <Text style={styles.completeButtonText}>CONTINUE</Text>
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
  // Timer row: a flex-1 spacer, the centered timer, and a flex-1 actions group — equal-width
  // outer flex areas are what keep the timer text visually centered on the screen even though
  // the actions group (two icon buttons) is wider than the empty spacer opposite it.
  timerRow: { flexDirection: 'row', alignItems: 'center' },
  timerRowSpacer: { flex: 1 },
  timerRowActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  elapsed: { fontSize: 34, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  // Compact rather than the old 76x56: they now share a line with the timer instead of owning a
  // row of their own, so their footprint has to stay small enough not to eat into that line's
  // height or crowd the centered timer.
  sessionIconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionIconText: { fontSize: 18, fontWeight: '800', color: '#334155', lineHeight: 22 },
  pausedBanner: { textAlign: 'center', fontSize: 14, color: '#0369a1', paddingVertical: 4 },
  swapNotice: { textAlign: 'center', fontSize: 13, color: '#1d4ed8', paddingVertical: 2 },
  hero: { alignItems: 'center', gap: 12 },
  // Paused, not disabled: a cool tint behind the still-live set, so the state reads at a glance
  // without anything looking switched off.
  heroPaused: { backgroundColor: '#f0f9ff', borderRadius: 16, paddingVertical: 12 },
  pausedNudge: {
    backgroundColor: '#f0f9ff',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  pausedNudgeText: { fontSize: 15, color: '#0f172a' },
  pausedNudgeButtons: { flexDirection: 'row', gap: 10 },
  pausedNudgeSecondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pausedNudgeSecondaryText: { fontSize: 15, fontWeight: '600', color: '#334155' },
  pausedNudgePrimary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#0369a1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pausedNudgePrimaryText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  bandRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 6 },
  exerciseName: { fontSize: 26, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  setOf: { fontSize: 15, color: '#64748b' },
  repCounterLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: -4,
  },
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
  actionRow: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  heroIconButton: {
    width: 76,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIconText: { fontSize: 22, fontWeight: '800', color: '#334155', lineHeight: 26 },
  // Swap is the one control here that changes *what* you are doing rather than how this set
  // goes, so it carries the same blue the approval card gives it.
  heroSwapButton: { backgroundColor: '#dbeafe' },
  heroSwapText: { color: '#1d4ed8' },
  // Rewind on the workout's first set: still there, still the same size, just visibly not
  // offering anything — nothing moves under a thumb that was already reaching for swap.
  heroIconButtonDisabled: { backgroundColor: '#f1f5f9' },
  heroIconTextDisabled: { color: '#cbd5e1' },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    minHeight: 44,
    justifyContent: 'center',
  },
  actionButtonText: { fontWeight: '600', color: '#334155' },
  // Flanks the ring with the ±5s buttons pre-start; centered either way since they unmount once
  // the hold begins rather than leaving an empty gap where they sat.
  circleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'center' },
  // The set's primary control, so it is filled and lifted rather than an outline drawn on the page
  // — it should read as something to press from across a room. 216 leaves the caption a full line
  // inside the stroke at every phase.
  circleTimer: {
    width: 216,
    height: 216,
    borderRadius: 108,
    borderWidth: 6,
    borderColor: '#111',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    gap: 2,
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
  },
  // Stopped — the user's own pause or the session's. The same cool blue `heroPaused` uses, so a
  // frozen clock reads the same everywhere, and still plainly on rather than switched off.
  circleTimerStopped: { borderColor: '#0369a1', backgroundColor: '#f0f9ff' },
  circleTimerFlat: { backgroundColor: 'transparent', shadowOpacity: 0 },
  // Sinks slightly under the thumb. The only feedback a 216pt target needs.
  circleTimerPressed: { transform: [{ scale: 0.97 }], shadowOpacity: 0.04 },
  circleTimerText: {
    fontSize: 60,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -1.5,
    // Otherwise the whole number shifts sideways every time a digit changes width, once a second,
    // for the entire hold.
    fontVariant: ['tabular-nums'],
  },
  circleTimerTextStopped: { color: '#075985' },
  // Sits right under the big number, small enough that it reads as a unit on that number rather
  // than a second line competing with the caption below it.
  circleUnit: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginTop: -6,
  },
  circleCaption: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  circleCaptionStopped: { color: '#0369a1' },
  circleHint: { fontSize: 13, color: '#94a3b8' },
  // A seam between stages, so it reads as a card rather than as another exercise page.
  stageFeedback: { gap: 12, paddingVertical: 8 },
  stageFeedbackEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  stageFeedbackTitle: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  stageFeedbackSubtitle: { fontSize: 14, color: '#64748b', marginBottom: 4 },
  levelBadge: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  calibrating: { fontSize: 12, color: '#b45309', fontWeight: '600' },
  nextUp: { fontSize: 13, color: '#64748b' },
  disclosureTitle: { fontSize: 14, fontWeight: '700', color: '#334155' },
  disclosureBody: { fontSize: 13, color: '#64748b', marginTop: 4 },
});
