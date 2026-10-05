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
 * rep target itself is no longer a standalone line — it is what the rep counter defaults to, and
 * sits under the numeral as a quiet "target" note rather than a second headline.
 *
 * **Presentation (docs/DESIGN.md §5.7, "Ignition").** The native header is hidden; this screen draws
 * its own top bar (home / elapsed clock / pause / stop), a session `SegmentedBar`, and a section
 * chip. The exercise hero is a card with a gradient border in the section's color (gold warm-up,
 * teal main, coral cool-down); rest flips it to coral. Everything visual is a token or a `ui/`
 * primitive — none of it reads or writes anything the store didn't already.
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
import { ActivityIndicator, Animated, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { exerciseStateRepo, remoteConfigRepo, sessionsRepo, usersRepo } from '@roamfit/store';
import type { SessionRecord } from '@roamfit/store';
import { alternativesForSlot } from '@roamfit/engine';
import type { BandId } from '@roamfit/engine';
import type { SwapAlternative } from '@roamfit/engine';
import type { Anchor, AnchorClass, Pattern, ProgressionFamilyId } from '@roamfit/data';
import {
  gutter,
  makeStyles,
  motion,
  radius,
  space,
  type as textStyles,
  useTheme,
  type AccentName,
  withAlpha,
} from '../theme';
import { useOptionalThemePreference } from '../state/ThemeProvider';
import {
  Button,
  Card,
  Chip,
  Icon,
  IconButton,
  Pips,
  PressableScale,
  ProgressRing,
  Screen,
  SegmentedBar,
  Sheet,
  Toast,
  Txt,
  haptics,
  useReduceMotion,
} from '../ui';
import { useInsets } from '../ui/useInsets';
import { exerciseComplete, lastSet, pick, rest as restLines, setComplete } from '../lib/hypeCopy';
import type { RootStackParamList } from '../navigation/types';
import { homeReset } from '../navigation/routes';
import { useStore } from '../state/StoreContext';
import { localDateFromDate, nowEngineClock, nowUtcInstant } from '../lib/localClock';
import {
  activeEntries,
  findCurrentEntry,
  positionsInOrder,
  samePosition,
  sessionCursorPosition,
  stepPosition,
} from '../lib/sessionProgress';
import type { Section, SessionPosition } from '../lib/sessionProgress';
import { useCountdown } from '../lib/useCountdown';
import type { CountdownController } from '../lib/wallClockTimer';
import AnchorBadge from '../components/AnchorBadge';
import PinnedNote from '../components/PinnedNote';
import KeyboardDoneBar from '../components/KeyboardDoneBar';
import FeedbackControls from '../components/FeedbackControls';
import type { Difficulty } from '../components/FeedbackControls';
import BandPicker from '../components/BandPicker';
import BandChip from '../components/BandChip';
import DemoMedia from '../components/DemoMedia';
import type { DemoMediaProps } from '../components/DemoMedia';
import AbandonSessionButton from '../components/AbandonSessionButton';
import SpotifyControls from '../components/SpotifyControls';
import {
  configureWorkoutAudioSession,
  setCueSoundsEnabled,
  startBackgroundKeepAlive,
  stopBackgroundKeepAlive,
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
  return `Lvl ${index + 1}/${family.levels.length} · ${family.name}`;
}

export default function WorkoutScreen({ navigation, route }: Props): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const themePreference = useOptionalThemePreference();
  // §10.8 — "Keep-awake for the whole active session; released on completion or abandonment."
  // `useKeepAwake` activates on mount and deactivates automatically on unmount, which covers
  // both cases: navigating to Summary on completion, or navigating away (Home/back) on
  // abandonment both unmount this screen.
  useKeepAwake();

  const { sessionId, reviewFromSummary, jumpTo } = route.params;
  const { db, library, families } = useStore();
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [phase, setPhase] = useState<Phase>('exercise');
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  // The "how did that feel" modal over the rest page. Opened by `commitSetAndRest` (a completed
  // set just landed), never derived from `phase`, so resuming a persisted rest does not re-ask.
  const [feedbackPromptOpen, setFeedbackPromptOpen] = useState(false);
  // §8.1 — which entry the rest screen's feedback controls apply to (the one just performed,
  // not `current`'s post-reload "next up" entry). See the comment in `finishSetAndRest`.
  const [restingEntryId, setRestingEntryId] = useState<string | null>(null);
  // Same reasoning, for the §10.7 "+15s recorded as a fatigue signal" write: the set just
  // completed, not whatever `current`'s post-reload setIndex points at during the rest phase.
  const [restingSetIndex, setRestingSetIndex] = useState<number | null>(null);
  const insets = useInsets();
  /** The coach line that rises after a completed set. Lives here rather than in the set view: a
   *  completed set swaps straight to the rest page, so anything owned by the set view would unmount
   *  before it could be read. Seeded per (entry, set) so the same set always gets the same line. */
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null);
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
  /** The notice is a momentary confirmation, not session state: it shows for 3s, fades, then
   *  clears itself. Keyed on the message text so a fresh swap restarts the clock. */
  const swapNoticeOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (swapNotice == null) return;
    swapNoticeOpacity.setValue(1);
    let fade: Animated.CompositeAnimation | null = null;
    const timer = setTimeout(() => {
      fade = Animated.timing(swapNoticeOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      });
      fade.start(({ finished }) => {
        if (finished) setSwapNotice(null);
      });
    }, 3000);
    return () => {
      clearTimeout(timer);
      fade?.stop();
    };
  }, [swapNotice, swapNoticeOpacity]);
  /** §1140 — band colours are user data, not a palette this screen invents. */
  const user = usersRepo.ensureUser(db, nowUtcInstant());
  const bandTensions = user.bandTensions;
  const soundsAvailable = user.cueSoundsEnabled;
  const feedbackAsModal = user.feedbackPromptEnabled;
  useEffect(() => {
    setCueSoundsEnabled(soundsAvailable);
    return () => setCueSoundsEnabled(soundsAvailable);
  }, [soundsAvailable]);
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
  /** Whether the landing effect below has already placed this screen instance onto its arrival
   *  bookmark/cursor. Keyed on its own ref rather than on `rewoundTo` being non-null: completing a
   *  set legitimately clears `rewoundTo` back to null (so the workout resumes at its own front
   *  edge) even when it was reached via `jumpTo`, and `session` gets a new object identity on
   *  every `reload()` — without this ref, that combination re-ran the landing effect on every
   *  subsequent reload and re-applied the same `jumpTo` bookmark forever, trapping the screen on
   *  the set just completed instead of letting it move on. */
  const arrivalHandledRef = useRef(false);

  const reload = useCallback(
    () => setSession(sessionsRepo.getSession(db, sessionId)),
    [db, sessionId],
  );

  useEffect(() => {
    reload();
    const id = setInterval(() => forceElapsedTick((n) => n + 1), 1000);
    // §10.8 — configured once for the life of the session, re-asserted here rather than only at
    // app boot: the guard against Wave 6's YouTube player having last left the shared audio
    // session in a different shape (see workoutAudio.ts's file header).
    void configureWorkoutAudioSession().then(startBackgroundKeepAlive);
    void ensureNotificationPermission();
    return () => {
      clearInterval(id);
      stopBackgroundKeepAlive();
    };
  }, [reload]);

  /** The workout's own front edge: §10.8's derived "first not-yet-logged set". This is what says
   *  whether the workout is finished, regardless of which set the user is currently looking at. */
  const frontier = session ? findCurrent(session) : null;
  /**
   * The set on screen. Normally the front edge; while the user has stepped back with Undo it is the
   * earlier set they moved to. A rewind target that no longer exists (its entry was swapped out
   * from under it, say) silently resolves back to the front edge rather than stranding the screen.
   */
  const rewoundEntry =
    session && rewoundTo ? activeEntries(session).find((e) => e.id === rewoundTo.entryId) : null;
  /**
   * The last set of the whole plan (almost always a cool-down set) still owes its own rest and
   * feedback — the set just performed, not whatever comes after it, which for this one set is
   * nothing. `frontier` is already null by the time that rest page is on screen (every slot is
   * logged), so without this fallback the screen would fall straight through to the "no current
   * set" guard below and show a spinner instead. Resolving `current` to the entry that was just
   * rested after, purely so the guard passes and the rest page has something to key off of — the
   * render below reads `!frontier` (not `entry`) wherever it needs to know this is actually the
   * end, e.g. the "next up" preview.
   */
  const isFinalRest = phase === 'resting' && !frontier;
  const restingEntryForFallback =
    isFinalRest && session && restingEntryId != null
      ? (activeEntries(session).find((e) => e.id === restingEntryId) ?? null)
      : null;
  // The set just performed, same id `restingEntryId` already resolves for §8.1 feedback and the
  // final-rest fallback above — but needed unconditionally here (not only when `isFinalRest`),
  // since the pinned note on the rest screen is about the exercise just finished, not `entry`'s
  // post-reload "next up" one, on every rest page, not only the last.
  const restingEntry =
    session && restingEntryId != null
      ? (activeEntries(session).find((e) => e.id === restingEntryId) ?? null)
      : null;
  // §8.1 — feedback is one answer per *exercise*, asked on the rest after its final set: the
  // completed set just rested after has every sibling set logged (done or skipped). Derived from
  // the session, not remembered, so a resumed rest and the inline fallback agree with the modal.
  const feedbackDue =
    phase === 'resting' &&
    restingEntry != null &&
    restingSetIndex != null &&
    restingEntry.setLogs.find((l) => l.setIndex === restingSetIndex)?.status === 'completed' &&
    Array.from({ length: restingEntry.sets }, (_, i) => i).every((i) => {
      const log = restingEntry.setLogs.find((l) => l.setIndex === i);
      return log != null && log.status !== 'not_reached';
    });
  const feedbackSetCount =
    restingEntry?.setLogs.filter((l) => l.status === 'completed').length ?? 0;
  const feedbackExerciseName =
    (restingEntry && library.exercises.find((e) => e.id === restingEntry.exerciseId)?.name) ??
    restingEntry?.exerciseId ??
    'this exercise';
  const feedbackQuestion = `How did ${
    feedbackSetCount === 1 ? 'that set' : `those ${feedbackSetCount} sets`
  } of ${feedbackExerciseName} feel?`;
  const current =
    rewoundEntry && rewoundTo && rewoundTo.setIndex < rewoundEntry.sets
      ? { entry: rewoundEntry, setIndex: rewoundTo.setIndex }
      : (frontier ??
        (restingEntryForFallback && restingSetIndex != null
          ? { entry: restingEntryForFallback, setIndex: restingSetIndex }
          : null));
  const entry = current?.entry;
  const exercise = entry ? library.exercises.find((e) => e.id === entry.exerciseId) : undefined;

  // Whether `jumpTo` actually names a slot still in the plan — the entry could since have been
  // swapped or removed. Computed once here rather than inline in each effect below, since both
  // the landing effect and the auto-navigate guard need the exact same answer: an invalid bookmark
  // must fall through to ordinary behavior in both places, not just silently suppress one of them.
  const jumpToValid =
    !!session &&
    !!jumpTo &&
    activeEntries(session).some((e) => e.id === jumpTo.entryId && jumpTo.setIndex < e.sets);

  // Arriving with a valid explicit bookmark (a tap on a set in Summary) lands on exactly that
  // (entry, set), and persists it as the "you are here" override (`setSessionCursor`) — a
  // Summary selection stands regardless of how much of the workout is actually logged, so it has
  // to survive past this one visit rather than live only in `rewoundTo`. Absent an explicit
  // bookmark this visit, a previously persisted override (from an earlier Summary tap) is honored
  // the same way. Otherwise, arriving back from Summary (before FINISH) to look at or fix
  // something lands on the last set rather than the front edge — the front edge is `null`
  // (everything is already logged), which is exactly the empty state the auto-navigate effect
  // below would otherwise read as "done, go to Summary" and bounce straight back out of. Runs
  // once per arrival, gated on `arrivalHandledRef` rather than `rewoundTo` — see that ref's own
  // comment for why `rewoundTo` alone can't be trusted to stay "handled".
  useEffect(() => {
    if (!session || arrivalHandledRef.current) return;
    arrivalHandledRef.current = true;
    if (jumpToValid && jumpTo) {
      setRewoundTo(jumpTo);
      sessionsRepo.setSessionCursor(db, sessionId, jumpTo, nowUtcInstant());
      return;
    }
    if (!reviewFromSummary) {
      const cursor = sessionCursorPosition(session);
      if (cursor) setRewoundTo(cursor);
      return;
    }
    const positions = positionsInOrder(session);
    const last = positions[positions.length - 1];
    if (last) setRewoundTo(last);
  }, [reviewFromSummary, jumpTo, jumpToValid, session, db, sessionId]);

  // Restores the rest page across a remount — most commonly the "Progress" button, which
  // `replace`s this screen with Summary and back again, but equally an app relaunch mid-rest.
  // `phase`/`restingEntryId`/`restingSetIndex` are ordinary component state, reset to their
  // defaults on every fresh mount; `session.restingEntryId` (migration 0021) is what survives, so
  // the very first time a session loads with it set, local state is brought back in line with it.
  // Runs once per arrival, same shape as the bookmark-restoring effect above and for the same
  // reason: after this, the phase is live and driven by the ordinary set-completion/Next flow, not
  // by re-reading the row on every reload (which would fight a user who has since left the rest
  // page in this same visit).
  const restingRestoredRef = useRef(false);
  useEffect(() => {
    if (!session || restingRestoredRef.current) return;
    restingRestoredRef.current = true;
    if (session.restingEntryId != null && session.restingSetIndex != null) {
      setRestingEntryId(session.restingEntryId);
      setRestingSetIndex(session.restingSetIndex);
      setPhase('resting');
    }
  }, [session]);

  useEffect(() => {
    // Keyed on the front edge, not on what is being viewed: the workout is over when every set is
    // logged, and a user who has stepped back to look at an earlier set has not undone that.
    //
    // The last set's own rest page is the one thing that stands between it and the summary, even
    // when that set is the literal end of the workout (typically the last cool-down set): rest and
    // its feedback question apply to the set just performed regardless of what, if anything, comes
    // after it, so without this guard the screen would navigate straight past the page it just
    // opened. Reviewing from Summary and arriving at a valid explicit bookmark are the other cases
    // that have to sit this out — the workout was already over when the user asked to come back to
    // it (or to a specific set in it), and auto-forwarding right past them would make the return
    // trip pointless. An *invalid* bookmark must NOT suppress this — there is nothing for it to
    // land on, so falling through to Summary is the only way the screen doesn't get stuck showing
    // nothing.
    //
    // Reads `session?.restingEntryId`, not just local `phase`, so a just-restored-but-not-yet-
    // rendered rest (the effect above and this one can fire in the same pass, before local state
    // catches up) can't lose the race and bounce straight to Summary anyway — see migration 0021.
    if (
      session &&
      !frontier &&
      phase !== 'resting' &&
      session.restingEntryId == null &&
      !reviewFromSummary &&
      !jumpToValid
    ) {
      navigation.replace('Summary', { sessionId });
    }
  }, [session, frontier, phase, navigation, sessionId, reviewFromSummary, jumpToValid]);

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
        <ActivityIndicator color={theme.colors.teal} />
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

  if (!current || !entry) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.teal} />
      </View>
    );
  }

  const { setIndex } = current;
  /**
   * Which band this set is on.
   *
   * A set that has already been logged shows the band *it* was trained with — stepping back to
   * set 1 after moving up a band on set 2 has to report what set 1 actually used, not the newest
   * band on the entry. (This used to take the highest-setIndex logged band regardless of which
   * set was on screen, so a rewind silently relabelled the earlier set's load.)
   *
   * A set that hasn't run yet carries the last logged band forward, falling back to the
   * prescription: a user who switches to a heavier band on set 1 is not asked again on set 2. The
   * switch is still recorded per set either way, and `entry.band` (the plan) is never rewritten,
   * so planned-vs-actual survives.
   */
  const loggedSetForThisSet = entry.setLogs.find((s) => s.setIndex === setIndex);
  const carriedForwardBand = entry.setLogs
    .filter((s) => s.bandActual != null && s.setIndex < setIndex)
    .sort((a, b) => b.setIndex - a.setIndex)[0]?.bandActual;
  const bandForSet: BandId | null =
    loggedSetForThisSet?.bandActual ?? carriedForwardBand ?? entry.band;

  /**
   * Reps and hold length get the same treatment as the band, and for the same reason: the hero
   * components seed their state from the prescription and are remounted per set, so stepping back
   * to a set the user already logged redisplayed what they were *asked* to do instead of what they
   * recorded doing. The summary read the logs and so was right, which is how the disagreement
   * showed up.
   *
   * Unlike the band, these deliberately do NOT carry forward onto sets that have not run yet. A
   * band is equipment — switch to a heavier one on set 1 and you are still holding it on set 2, so
   * pre-filling saves asking twice. Reps and seconds are performance against a prescription that
   * has not changed: managing 10 of a prescribed 12 does not make 10 the ask for the next set.
   */
  const repsForSet = loggedSetForThisSet?.repsActual ?? entry.repTarget ?? 0;
  /** `secondsActual` is the whole set — for a unilateral hold that is both sides summed (see
   *  `TimedExercise`'s `onComplete`), while the timer itself works in per-side seconds. */
  const secondsForSet =
    loggedSetForThisSet?.secondsActual != null
      ? Math.round(loggedSetForThisSet.secondsActual / (entry.unilateral ? 2 : 1))
      : (entry.durationSec ?? 0);
  const exState = exerciseStateRepo.getExerciseState(db, entry.exerciseId);
  const isFirstEverPerformance = !exState || exState.sessionsPerformed === 0;
  // The pinned note above the hero/rest content is about the exercise just finished while resting
  // (same as the rest screen's other feedback controls, and unlike `exState` above, which is
  // deliberately about `entry` — the upcoming set — for the hero's own display).
  const noteExerciseId =
    phase === 'resting' ? (restingEntry?.exerciseId ?? entry.exerciseId) : entry.exerciseId;
  const noteExState =
    noteExerciseId === entry.exerciseId
      ? exState
      : exerciseStateRepo.getExerciseState(db, noteExerciseId);
  /** The rest countdown resumes with whatever time was actually left, not a fresh full rest, when
   *  the rest page was just restored after a remount (session.restingStartedAt survives it; the
   *  local `phase` state does not) — same "derive from an absolute instant" principle the session
   *  elapsed timer uses. Equal to `entry.restSec` for the overwhelmingly common case where the
   *  rest page never left the screen (elapsed since starting rest is ~0). */
  const restSecRemaining =
    phase === 'resting' && session?.restingStartedAt
      ? Math.max(
          0,
          entry.restSec - sessionsRepo.restElapsedSec(session.restingStartedAt, nowUtcInstant()),
        )
      : entry.restSec;

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
   *  generating again is one tap away from there if that is what the user wants.
   *
   * `reset`, not `navigate` — the discarded session's Workout (and whatever Generate/Approval/
   * Summary sits under it from however this screen was reached) must not survive underneath Home
   * as a back destination; a header back button leading to a discarded session is exactly the
   * stray reference this is guarding against. Same call SummaryScreen's FINISH button already
   * uses to land cleanly on Home. */
  const handleAbandon = () => {
    sessionsRepo.discardSession(
      db,
      sessionId,
      { abandonedEntryId: entry.id, abandonedSetIndex: setIndex },
      nowUtcInstant(),
    );
    navigation.reset(homeReset());
  };

  /**
   * §10.6 swap, in one tap. The picker sheet this replaced asked the user to choose between
   * alternatives the engine had *already ranked* — so it was asking them to second-guess a
   * decision they had no more information about than the engine did, mid-set, with a rest timer
   * about to start. Taking the top-ranked candidate is the same answer without the interruption.
   *
   * `alternativesForSlot` is the same call the sheet was fed by (invariant 2: the engine still
   * decides), and its results are already sorted best-first — nearest difficulty, then tier.
   * Tapping again simply swaps again, which is the cheap way to reject a suggestion.
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
   * Moving around the workout without training a set: Undo steps back a set, Skip/Next steps forward.
   *
   * Stepping back is pure navigation — nothing is logged and nothing already logged is deleted,
   * so a user who wants another look at the previous exercise (did I really do three sets? what
   * band was that? what did the cue say?) can go and look and come straight back. The set they
   * step back onto keeps whatever log it already has until they train it again, at which point
   * `logSet`'s upsert overwrites that one row — a deliberate redo, never a silent one.
   *
   * The forward control therefore means two things, and says which in its accessible name:
   *   - at the front edge (the normal case) it is the §10.5 skip it has always been: the set is
   *     logged as `skipped` and the workout moves straight on to the next one — no rest in
   *     between, see `skipSetAndAdvance`.
   *   - while stepped back it is the mirror of Undo, walking forward over sets that are already
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
   *  stale copy of it — and the persisted "you are here" cursor is cleared right along with it,
   *  since there is nothing left to override. */
  const moveTo = (position: SessionPosition) => {
    const atFront = samePosition(position, frontierPosition);
    setRewoundTo(atFront ? null : position);
    sessionsRepo.setSessionCursor(db, sessionId, atFront ? null : position, nowUtcInstant());
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
   * the rest screen's difficulty control asks how the set felt; a skipped set was never
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
    sessionsRepo.setSessionCursor(db, sessionId, null, nowUtcInstant());
    setSwapNotice(null);
    setPhase('exercise');
    reload();
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
    // Re-completing a set that already has a log (one reached via a Summary/Progress bookmark, or
    // walked back to with Undo) is still a real completion — it gets its own rest page like any
    // other, same as a first-time completion of a jumped-to set below. `restingEntryId`/
    // `restingSetIndex`, captured right after this, point at the set just (re)completed, so the
    // rest page is never confused with the real front edge regardless of which one this was.
    logCurrentSet(status, repsActual, secondsActual, pauseInfo);
    if (status === 'completed') announceCompletion();

    // §8.1 — feedback is about the exercise just performed, not whatever `reload()` (called
    // right below) causes `current`/`entry` to recompute to next render (the *upcoming* entry,
    // which is what `nextLabel`'s "Next up" preview correctly wants instead). Captured here,
    // before reload, so the rest screen's feedback controls target the right exercise.
    setRestingEntryId(entry.id);
    setRestingSetIndex(setIndex);
    setDifficulty(entry.difficultyFeedback ?? null);
    setFeedbackPromptOpen(status === 'completed' && feedbackAsModal);
    setPhase('resting');
    setPausedCompletion(null);
    // Persisted alongside the local state above — see `setRestingCursor`'s doc comment for why:
    // without this, leaving the rest page via the "Progress" button (which `replace`s this screen
    // with Summary, unmounting it) silently lost the rest and landed back on the next exercise.
    sessionsRepo.setRestingCursor(db, sessionId, { entryId: entry.id, setIndex }, nowUtcInstant());
    // The workout turns pages from wherever it was, not back to the derived front edge: a set
    // completed at the front edge advances one page, exactly as before, but a set completed after
    // jumping ahead from Summary (an untouched set that isn't the front edge) must also advance
    // to *its own* next page rather than snapping back to an earlier still-untouched exercise —
    // that snap-back is what made completing a jumped-to set look like it looped back on itself.
    // `stepPosition` only reads plan structure (never log status), so it's safe to compute here,
    // before `reload()`, against the position that was just trained.
    //
    // The one case this still clears the override entirely (matching `moveTo`'s own convention)
    // is landing exactly on the newly-recomputed front edge, or running off the end of the plan
    // (`nextPosition` null) — nothing left to override the derived position with in either case.
    const nextPosition = stepPosition(session, currentPosition, 1);
    const updatedFrontier = findCurrent(sessionsRepo.getSession(db, sessionId)!);
    const updatedFrontierPosition = updatedFrontier
      ? { entryId: updatedFrontier.entry.id, setIndex: updatedFrontier.setIndex }
      : null;
    const overridePosition =
      nextPosition && !samePosition(nextPosition, updatedFrontierPosition) ? nextPosition : null;
    setRewoundTo(overridePosition);
    sessionsRepo.setSessionCursor(db, sessionId, overridePosition, nowUtcInstant());
    reload();
  };

  /**
   * The coach's one-liner for a set just completed (DESIGN.md §6). Which pool is a pure function
   * of where the set sits in the plan: the set *before* the session's last one earns "Last set.
   * Empty the tank." (it is a nudge for what is coming, so it is never said after the final set),
   * the closing set of an exercise gets the exercise-done line, anything else the set line. The
   * line is picked deterministically from the (entry, set) so a re-render never re-rolls it.
   */
  const announceCompletion = () => {
    const positions = positionsInOrder(session);
    const lastPosition = positions[positions.length - 1] ?? null;
    const next = stepPosition(session, currentPosition, 1);
    const lastSetComesNext = next !== null && samePosition(next, lastPosition);
    const closesExercise = setIndex === entry.sets - 1;
    const pool = lastSetComesNext ? lastSet : closesExercise ? exerciseComplete : setComplete;
    setToast((t) => ({
      message: pick(pool, `${entry.id}:${setIndex}`),
      key: (t?.key ?? 0) + 1,
    }));
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
    sessionsRepo.setRestingCursor(db, sessionId, null, nowUtcInstant());
    reload();
  };

  const handlePinnedNoteChange = (note: string) => {
    const localToday = localDateFromDate(new Date());
    exerciseStateRepo.setPinnedNote(
      db,
      noteExerciseId,
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

  /**
   * The rest page's feedback is about the *exercise* just finished, asked once after its last set;
   * `recordEntryFeedback` writes the entry's single answer (and feeds the exercise's EMA).
   *
   * `null` here means "the user just cleared it", which is different from omitting the key — see
   * `recordEntryFeedback`'s contract.
   */
  const recordFeedback = (feedback: { difficulty?: Difficulty | null }) => {
    sessionsRepo.recordEntryFeedback(db, restingEntryId ?? entry.id, feedback, nowUtcInstant());
  };

  const handleDifficultyChange = (d: Difficulty | undefined) => {
    setDifficulty(d ?? null);
    recordFeedback({ difficulty: d ?? null });
  };

  /** Any answer from the modal records it and uncovers the rest timer; Skip records nothing. */
  const handleFeedbackPromptAnswer = (d: Difficulty | null) => {
    if (d) handleDifficultyChange(d);
    setFeedbackPromptOpen(false);
  };

  const sessionSection = entry.section as Section;
  const sectionTone = SECTION_TONE[sessionSection] ?? 'teal';
  const entries = activeEntries(session);
  const segmentValues = entries.map(
    (e) => e.setLogs.filter((l) => l.status === 'completed').length / Math.max(e.sets, 1),
  );
  const activeSegment = entries.findIndex((e) => e.id === entry.id);

  return (
    <Screen edges={['top', 'left', 'right']} padded={false} testID="workout-screen">
      {/* The top bar is one row, and the elapsed clock is the biggest type in it: it is what a user
          mid-set, at arm's length, glances at most often, so it gets the top line and `hero`
          numerals rather than sharing space with a label. Home rides the left, pause/stop the
          right; the two side groups are the same fixed width so the clock stays visually centered
          (which is also why there is no "Elapsed" prefix on the clock text itself). The bar's
          buttons are the compact `sm` size (hitSlop keeps the target ~52pt) so two of them fit a
          side without crowding the clock. It replaces the native header, which is hidden for this
          screen. */}
      <View style={styles.topBar}>
        <View style={styles.barSide}>
          {/* Home lives top-left. Pausing first (idempotent with the workout-level Pause button)
              means Home's resume card picks the session back up at the same set; this is never
              Abandon, which discards. `RootNavigator` turns off the edge-swipe gesture for this
              screen so this is the only way off it (besides Progress/Abandon). */}
          <IconButton
            testID="workout-home"
            size="sm"
            icon="home"
            accessibilityLabel="Pause and go to Home"
            onPress={() => {
              sessionsRepo.pauseSession(db, sessionId, nowUtcInstant());
              navigation.navigate('Tabs', { screen: 'Home' });
            }}
          />
          {/* §8.5 — one tap to the other light, mid-session: the courtyard case. Sits on the left
              beside Home so the right group (pause/stop) and the centered clock keep their width.
              Sets an explicit, persisted preference. The icon names the destination, not the state. */}
          {themePreference && (
            <IconButton
              testID="theme-toggle"
              size="sm"
              icon={themePreference.scheme === 'dark' ? 'sun' : 'moon'}
              accessibilityLabel={
                themePreference.scheme === 'dark' ? 'Switch to Daybreak' : 'Switch to Midnight'
              }
              onPress={() =>
                themePreference.setPreference(themePreference.scheme === 'dark' ? 'light' : 'dark')
              }
            />
          )}
        </View>
        <Txt
          variant="hero"
          testID="workout-elapsed"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          style={styles.clock}
        >
          {Math.floor(sessionElapsedSec / 60)}m {Math.floor(sessionElapsedSec % 60)}s
        </Txt>
        <View style={[styles.barSide, styles.barSideRight]}>
          <IconButton
            testID="pause-workout"
            size="sm"
            icon={paused ? 'play' : 'pause'}
            accessibilityLabel={paused ? 'Resume workout' : 'Pause workout'}
            tone={paused ? 'teal' : 'text'}
            onPress={paused ? handleResume : handlePause}
          />
          <AbandonSessionButton onConfirm={handleAbandon} variant="icon" iconSize="sm" />
        </View>
      </View>

      {/* Session progress: one segment per exercise, filled by its completed sets, the current
          exercise glowing in its section's color. */}
      <SegmentedBar
        values={segmentValues}
        activeIndex={activeSegment}
        color={theme.section[sessionSection] ?? theme.colors.teal}
        style={styles.segments}
      />

      <ScrollView
        ref={scrollRef}
        testID="workout-scroll"
        style={styles.scroll}
        contentContainerStyle={[
          styles.container,
          { paddingBottom: insets.bottom + space.huge + space.xxl },
        ]}
        // Without this a tap on Save while the keyboard is up is spent dismissing the keyboard, so
        // the paste has to be confirmed twice.
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* Sits with the session-level controls (timer, pause, stop) rather than with the
            exercise content, because that is what it is: something about this whole workout, not
            about this set. Above the phase view so it is in the same place during a set and
            during a rest — rest is when a user actually reaches for it, and a control that moves
            between the two moments is a control you have to look for. Renders nothing at all when
            there is no Spotify, so a user who doesn't use it never pays the row. */}
        <SpotifyControls />

        <View style={styles.metaRow}>
          <Chip label={SECTION_LABEL[sessionSection] ?? entry.section} tone={sectionTone} />
          {paused && <PausedChip />}
          <View style={styles.metaSpacer} />
          {/* §14.1's real-time progress view — a persistent way to check completed/skipped sets
              and where you currently are, from any phase of the active workout. "Done" replaces
              it once reviewing from Summary (before FINISH): that mode has no front edge for the
              forward control to walk to, so this is the only route back to Summary once there. */}
          <Chip
            testID={reviewFromSummary ? 'review-done' : 'view-progress'}
            label={reviewFromSummary ? 'Done' : 'Progress'}
            icon={reviewFromSummary ? 'check' : 'trendingUp'}
            tone="sky"
            onPress={() => navigation.replace('Summary', { sessionId })}
          />
        </View>

        {swapNotice != null && (
          <Animated.View
            testID="swap-notice"
            style={[styles.swapNotice, { opacity: swapNoticeOpacity }]}
          >
            <Txt variant="small" color="coral" align="center">
              {swapNotice}
            </Txt>
          </Animated.View>
        )}

        {/* §10.4 — the gentle nudge, in the two-step-confirm shape this app uses everywhere else
            rather than a system alert. Neither answer is the "wrong" one, and the set is logged
            whichever is chosen, so nothing here reads as a warning. A sheet (not an inline
            banner) because it holds a real decision the rest of the screen is waiting on: no
            backdrop dismiss and no back-gesture dismiss (`onClose` is a no-op) — one of the two
            buttons must be pressed. */}
        <Sheet
          visible={pausedCompletion != null}
          onClose={() => {}}
          dismissable={false}
          testID="paused-completion-nudge"
        >
          <View style={styles.nudge}>
            <Txt variant="h2">Your timer is still paused</Txt>
            <Txt variant="body" color="text2">
              Your timer is still paused. Want to resume it?
            </Txt>
            <View style={styles.nudgeButtons}>
              <Button
                testID="paused-completion-resume"
                label="Resume timer"
                variant="primary"
                size="lg"
                onPress={() => handlePausedCompletion(true)}
              />
              <Button
                testID="paused-completion-stay-paused"
                label="Stay paused"
                variant="secondary"
                size="md"
                fullWidth
                onPress={() => handlePausedCompletion(false)}
              />
            </View>
          </View>
        </Sheet>

        {/* "How did that set feel?" over the running rest timer. Like the paused-completion nudge
            it is a real prompt the screen waits on, so no backdrop or back-gesture dismiss — but
            Skip is always there, and nothing is required. */}
        <Sheet
          visible={feedbackPromptOpen && feedbackDue}
          onClose={() => {}}
          dismissable={false}
          testID="feedback-prompt"
        >
          <View style={styles.nudge}>
            <Txt variant="h2">{feedbackQuestion}</Txt>
            <FeedbackControls
              difficulty={null}
              onDifficultyChange={(d) => handleFeedbackPromptAnswer(d ?? null)}
            />
            <Button
              testID="feedback-prompt-skip"
              label="Skip"
              variant="secondary"
              size="md"
              fullWidth
              onPress={() => handleFeedbackPromptAnswer(null)}
            />
          </View>
        </Sheet>

        {/* The user's own note about this exercise, above the exercise itself: it is the thing
            they wrote down *because* they wanted to see it before doing the movement again. While
            resting, this is the exercise just finished (`noteExerciseId`), not the upcoming one
            the rest of the rest screen previews — same split as the feedback controls below. */}
        <PinnedNote note={noteExState?.pinnedNote ?? null} onChange={handlePinnedNoteChange} />

        {phase === 'exercise' ? (
          entry.durationSec != null ? (
            <TimedExercise
              key={`${entry.id}-${setIndex}`}
              entry={entry}
              durationDefault={secondsForSet}
              exerciseName={exercise?.name ?? entry.exerciseId}
              levelText={levelBadge(entry, families)}
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
              repsDefault={repsForSet}
              exerciseName={exercise?.name ?? entry.exerciseId}
              levelText={levelBadge(entry, families)}
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
            restSec={restSecRemaining}
            // `isFinalRest` means this is the last set of the whole plan — `entry`/`exercise` here
            // are only the just-finished one (see the `current` fallback above), not a real
            // upcoming exercise, so there is nothing to preview.
            nextLabel={
              isFinalRest
                ? 'Workout complete'
                : `${exercise?.name ?? entry.exerciseId} · set ${setIndex + 1} of ${entry.sets}`
            }
            nextName={isFinalRest ? 'Workout complete' : (exercise?.name ?? entry.exerciseId)}
            nextSetText={isFinalRest ? null : `Set ${setIndex + 1} of ${entry.sets}`}
            // Deterministic per (entry, set) — the same rest always gets the same line.
            restLine={pick(
              restLines,
              `${restingEntryId ?? entry.id}:${restingSetIndex ?? setIndex}`,
            )}
            pips={
              restingEntry && restingSetIndex != null
                ? {
                    done: Array.from({ length: restingEntry.sets }, (_, i) =>
                      restingEntry.setLogs.some(
                        (l) => l.setIndex === i && l.status === 'completed',
                      ),
                    ),
                    justDone: restingSetIndex,
                    color: theme.section[restingEntry.section as Section] ?? theme.colors.teal,
                  }
                : null
            }
            // Rest is exactly when a user would go and rig the next anchor, so the requirement is
            // worth naming before the set rather than at the top of it. `exercise` is already the
            // *upcoming* entry here — same post-reload reasoning `nextLabel` relies on.
            nextAnchor={isFinalRest ? null : (exercise?.anchor ?? null)}
            nextAnchorAlt={isFinalRest ? null : (exercise?.anchor_alt ?? null)}
            // `bandForSet` is already resolved against the *upcoming* entry/setIndex during rest
            // (see its own comment above) — the same band the exercise phase will show once this
            // rest ends, so rest is exactly when swapping to it is useful.
            nextBand={isFinalRest ? null : bandForSet}
            bandTensions={bandTensions}
            // Same DemoMedia props the exercise phase passes below (line ~1039) — `exercise` and
            // `entry` are already the *upcoming* pair during rest, so the video shown here is the
            // one about to be trained, not the one just finished.
            demoMedia={
              !isFinalRest && exercise
                ? {
                    videoSearchQuery: exercise.video_search,
                    curatedVideoId: remoteConfigRepo.getCuratedVideoId(db, exercise.id),
                    videoDemoted: videoFlagState.demoted,
                    userVideoId: exerciseStateRepo.getUserVideoId(db, exercise.id),
                    onAssignVideo: handleAssignVideo,
                    onClearVideo: handleClearVideo,
                    onExpand: handleDemoExpand,
                    onReportIssue: handleReportVideoIssue,
                    onPlayerError: handleDemoPlayerError,
                    onInputFocus: handleDemoInputFocus,
                  }
                : null
            }
            // Same source and gating as `demoMedia` above — `exercise` is already the *upcoming*
            // exercise during rest.
            howTo={!isFinalRest && exercise ? exercise.setup : null}
            difficulty={difficulty}
            onDifficultyChange={handleDifficultyChange}
            feedbackQuestion={feedbackDue && !feedbackAsModal ? feedbackQuestion : null}
            onNext={handleNextAfterRest}
            onExtend={handleRestExtend}
          />
        )}

        {phase === 'exercise' && (
          <>
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

      <Toast
        message={toast?.message}
        triggerKey={toast?.key}
        style={{ bottom: insets.bottom + space.xl }}
      />
    </Screen>
  );
}

const SECTION_TONE: Record<Section, AccentName> = {
  warmup: 'gold',
  main: 'teal',
  cooldown: 'coral',
};

const SECTION_LABEL: Record<Section, string> = {
  warmup: 'Warm-up',
  main: 'Main',
  cooldown: 'Cool-down',
};

/** "PAUSED" beside the section chip, breathing gently so a frozen clock reads as deliberate
 *  rather than broken. The pulse is dropped under Reduce Motion, and stopped on unmount. */
function PausedChip(): React.JSX.Element {
  const styles = useStyles();
  const reduceMotion = useReduceMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.45, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, opacity]);
  return (
    <Animated.View testID="paused-chip" style={[styles.pausedChip, { opacity }]}>
      <Chip label="Paused" tone="sky" icon="pause" />
    </Animated.View>
  );
}

/** The `pulse` motion (DESIGN.md §2): a 1 -> 1.06 loop while `active` — the final 3 seconds of any
 *  countdown. Dropped under Reduce Motion, reset when inactive, and stopped on unmount so no loop
 *  outlives the set. */
function usePulse(active: boolean): Animated.Value {
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active || reduceMotion) {
      scale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: motion.pulse.to,
          duration: motion.pulse.duration,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: motion.pulse.duration,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduceMotion, scale]);
  return scale;
}

/** The exercise hero's shell: a card with a 2px gradient border in the section's color. While the
 *  session clock is stopped it dims to 55% — tinted, not hidden or disabled, so the state reads at a
 *  glance and every control inside still works. */
function HeroCard({
  tone,
  paused = false,
  children,
}: {
  tone: AccentName;
  paused?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={paused ? styles.heroPaused : undefined} testID="hero-card">
      <Card variant="accent" tone={tone} padding="md">
        <View style={styles.heroBody}>{children}</View>
      </Card>
    </View>
  );
}

/**
 * Everything at the top of an exercise hero, shared by the reps and timed views: level chip, the
 * exercise name (`display`, up to two lines), the set row (pips + "Set N of M"), and the setup
 * chips — what the band goes on, right under what the exercise is, then which band to actually pick
 * up, mid-set, without leaving this screen (and, if that is not the one in your hand, which one you
 * really used).
 */
function ExerciseHeader({
  levelText,
  exerciseName,
  entry,
  setIndex,
  setSuffix,
  color,
  anchor,
  anchorAlt,
  bandUsed,
  bandTensions,
  onPickBand,
}: {
  levelText: string | null;
  exerciseName: string;
  entry: sessionsRepo.SessionEntryRecord;
  setIndex: number;
  /** e.g. " · Side 1 of 2" for a unilateral hold. */
  setSuffix?: string;
  color: string;
  /** What this exercise attaches to, for `AnchorBadge` — null for anything self-anchored, which
   *  renders nothing. Read off the library record, not the entry: the plan stores `anchorClass`
   *  (the §13.1 safety bucket), not the specific fixed point the user has to go and find. */
  anchor: Anchor | null;
  /** A second fixed point that works equally well (`Exercise.anchor_alt`) — the user should see
   *  every safe option while they're the one deciding what to rig, not just the first one. */
  anchorAlt: Anchor | null;
  bandUsed: BandId | null;
  bandTensions: Record<BandId, usersRepo.BandTension>;
  onPickBand: (band: BandId) => void;
}): React.JSX.Element {
  const styles = useStyles();
  // A skipped set is a quiet empty dot, never a filled one (invariant 4): only completed sets fill.
  const done = Array.from({ length: entry.sets }, (_, i) =>
    entry.setLogs.some((l) => l.setIndex === i && l.status === 'completed'),
  );
  return (
    <>
      {levelText != null && <Chip label={levelText} tone="summit" testID="level-chip" />}
      <Txt
        variant="display"
        testID="exercise-name"
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {exerciseName}
      </Txt>
      <View style={styles.setRow}>
        <Pips count={entry.sets} filled={done} current={setIndex} color={color} />
        <Txt variant="eyebrow" color="text2">
          Set {setIndex + 1} of {entry.sets}
          {setSuffix ?? ''}
        </Txt>
      </View>
      <View style={styles.chipRow}>
        <AnchorBadge anchor={anchor} anchorAlt={anchorAlt} />
        {bandUsed != null && (
          <BandPicker
            band={bandUsed}
            tensions={bandTensions}
            accessibilityLabel="Band used for this set"
            onChange={onPickBand}
          />
        )}
      </View>
    </>
  );
}

/**
 * The set's own controls: step back, swap, step forward — labeled `IconButton`s, shared by both
 * hero views. Found mid-set, at arm's length, so they are targets with a word under them. The
 * accessible names carry the meaning — including which of its two jobs the forward control is doing
 * right now:
 *   - at the front edge (the normal case) it is the §10.5 skip it has always been: the set is
 *     logged as `skipped` and the workout moves straight on to the next one — no rest in
 *     between, see `skipSetAndAdvance`.
 *   - while stepped back it is the mirror of Undo, walking forward over sets that are already
 *     logged, and it stops at the front edge rather than skipping past it. Stepping forward
 *     must never *create* skips the user did not ask for.
 */
function SetNavRow({
  onRewind,
  onSwap,
  onSkip,
  forwardIsSkip,
}: {
  /** Null on the workout's very first set, where there is nothing behind to step back to. The
   *  button stays in place, dimmed: the row does not reshuffle under a thumb already reaching
   *  for swap. */
  onRewind: (() => void) | null;
  onSwap: () => void;
  onSkip: () => void;
  /** True at the workout's front edge, where the forward control skips the set; false while
   *  stepped back, where it just walks forward over sets that are already logged. */
  forwardIsSkip: boolean;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.actionRow}>
      <IconButton
        testID="rewind-set"
        icon="undo"
        label="Undo"
        accessibilityLabel="Go back to the previous set"
        disabled={onRewind === null}
        onPress={() => onRewind?.()}
      />
      {/* Swap is the one control here that changes *what* you are doing rather than how this set
          goes. */}
      <IconButton
        testID="swap-set"
        icon="swap"
        label="Swap"
        tone="coral"
        accessibilityLabel="Swap this exercise for another"
        onPress={onSwap}
      />
      <IconButton
        testID="skip-set"
        icon="skip"
        label={forwardIsSkip ? 'Skip' : 'Next'}
        accessibilityLabel={forwardIsSkip ? 'Skip this set' : 'Go forward to the next set'}
        onPress={onSkip}
      />
    </View>
  );
}

/** Accessory bar id for the rep counter's number pad, which has no return key of its own. */
const REPS_ACCESSORY_ID = 'rep-count-accessory';

function RepsExercise({
  entry,
  repsDefault,
  exerciseName,
  levelText,
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
  /** "Lvl 3/7 · Horizontal push" for the level chip, or null when the entry has no ladder. */
  levelText: string | null;
  /** What this exercise attaches to, for `AnchorBadge` — see `ExerciseHeader`. */
  anchor: Anchor | null;
  /** A second fixed point that works equally well (`Exercise.anchor_alt`). */
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
  /** Reps to show on arrival: this set's own logged count once it has run, else the prescription.
   *  Never carried forward from an earlier set — see the caller. */
  repsDefault: number;
  onComplete: (reps: number) => void;
  /** The forward control: skips this set at the front edge, steps forward over an already-logged
   *  one while the user has stepped back. See `SetNavRow`. */
  onSkip: () => void;
  onSwap: () => void;
  /** Step back a set, or null on the workout's first set. */
  onRewind: (() => void) | null;
  forwardIsSkip: boolean;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  // Remounted per set (the caller keys on entry+setIndex), so both of these reset to the incoming
  // default each set without any explicit clearing — which is exactly why the default has to be
  // the set's own logged value when it has one, not the prescription.
  const [reps, setReps] = useState(repsDefault);
  const [bandUsed, setBandUsed] = useState(band);
  const color = theme.section[entry.section as Section] ?? theme.colors.teal;
  const tone = SECTION_TONE[entry.section as Section] ?? 'teal';
  const closesExercise = setIndex === entry.sets - 1;
  return (
    <>
      <HeroCard tone={tone} paused={paused}>
        <ExerciseHeader
          levelText={levelText}
          exerciseName={exerciseName}
          entry={entry}
          setIndex={setIndex}
          color={color}
          anchor={anchor}
          anchorAlt={anchorAlt}
          bandUsed={bandUsed}
          bandTensions={bandTensions}
          onPickBand={(b) => {
            setBandUsed(b);
            onBandChange(b);
          }}
        />

        {/* The rep counter is the centerpiece. The target rep count used to repeat here as its own
            "N reps" line — the same number the counter below already shows (it defaults to the
            prescription), so it now sits under the numeral as a quiet "target" note instead of a
            second headline. Tapping the numeral still edits it. */}
        <View style={styles.counter}>
          <Txt variant="eyebrow" color="text3">
            Reps
          </Txt>
          <View style={styles.counterRow}>
            <IconButton
              testID="rep-minus"
              icon="remove"
              size="xl"
              accessibilityLabel="Fewer reps"
              onPress={() => setReps((r) => Math.max(0, r - 1))}
            />
            <TextInput
              testID="rep-count"
              style={styles.repCountInput}
              keyboardType="number-pad"
              keyboardAppearance={theme.scheme}
              selectionColor={theme.colors.teal}
              selectTextOnFocus
              maxFontSizeMultiplier={1.3}
              accessibilityLabel="Reps completed"
              inputAccessoryViewID={REPS_ACCESSORY_ID}
              value={String(reps)}
              onChangeText={(t) => setReps(Number(t.replace(/[^0-9]/g, '')) || 0)}
            />
            <IconButton
              testID="rep-plus"
              icon="add"
              size="xl"
              accessibilityLabel="More reps"
              onPress={() => setReps((r) => r + 1)}
            />
          </View>
          {entry.repTarget != null && (
            <Txt variant="caption" color="text3">
              target {entry.repTarget}
            </Txt>
          )}
        </View>

        {/* Medium impact on every completed set; the closing set of an exercise gets the bigger
            success buzz. The coach line itself rises from the screen (see `announceCompletion`),
            because the set view is replaced by the rest page the instant this fires. */}
        <Button
          testID="complete-set"
          label="COMPLETE SET"
          icon="check"
          size="lg"
          haptic={false}
          style={styles.completeButton}
          onPress={() => {
            if (closesExercise) haptics.success();
            else haptics.medium();
            onComplete(reps);
          }}
        />

        <SetNavRow
          onRewind={onRewind}
          onSwap={onSwap}
          onSkip={onSkip}
          forwardIsSkip={forwardIsSkip}
        />
      </HeroCard>
      <KeyboardDoneBar nativeID={REPS_ACCESSORY_ID} testID="rep-count-done" />
    </>
  );
}

/** §10.5 — "a short switch-side interval" between a unilateral exercise's two sequential
 *  timers. Not spec'd as a specific number; 5s is enough to physically reposition without being
 *  long enough to feel like a second rest. */
const SWITCH_SIDE_SEC = 5;

/** The hold timer ring's diameter (DESIGN.md §5.7). */
const RING_SIZE = 240;
/** The rest ring is a touch smaller: it is read, not pressed. */
const REST_RING_SIZE = 220;

interface PauseInfo {
  pauseCount: number;
  pausedDurationSec: number;
}

function TimedExercise({
  entry,
  durationDefault,
  exerciseName,
  levelText,
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
  /** "Lvl 3/7 · Horizontal push" for the level chip, or null when the entry has no ladder. */
  levelText: string | null;
  /** What this exercise attaches to, for `AnchorBadge` — see `ExerciseHeader`. */
  anchor: Anchor | null;
  /** A second fixed point that works equally well (`Exercise.anchor_alt`). */
  anchorAlt: Anchor | null;
  setIndex: number;
  /** Per-side hold this set starts from: this set's own recorded length once it has run, else the
   *  prescription. Never carried forward from an earlier set — see the caller. */
  durationDefault: number;
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
  const styles = useStyles();
  const theme = useTheme();
  // The hold this set starts from, fixed for the life of this mounted set: the prescription, or
  // what the user recorded if this set has already run (`durationDefault`). `durationSec` below is
  // the (possibly user-adjusted) hold length actually used; the two are only ever different
  // between mount and the moment `handleStart` is pressed, while the ±5s buttons are live.
  const originalDurationSec = durationDefault;
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

  // Short enough to sit on one line under the ring, at every phase.
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

  const color = theme.section[entry.section as Section] ?? theme.colors.teal;
  const tone = SECTION_TONE[entry.section as Section] ?? 'teal';
  const stopped = selfPaused || paused;

  // How far through the current phase the ring is drawn: the hold fills as it is held, the
  // get-ready and switch-sides gaps fill over their own few seconds, and before the start it is
  // empty. Read off the live controllers, so it is exact rather than eased (`animate={false}`).
  const ringProgress = !started
    ? 0
    : inGetReady
      ? 1 - getReadyMs / 3000
      : switching
        ? 1 - switchCountdown.remainingMs / (SWITCH_SIDE_SEC * 1000)
        : 1 - activeCountdown.remainingMs / Math.max(durationSec * 1000, 1);
  // The `pulse` motion for the last three seconds of the hold (the count-out cue already gives
  // each of those seconds its own light haptic — see `cueCount`).
  const pulse = usePulse(inHold && !stopped && remainingSeconds >= 1 && remainingSeconds <= 3);

  return (
    <HeroCard tone={tone} paused={paused}>
      <ExerciseHeader
        levelText={levelText}
        exerciseName={exerciseName}
        entry={entry}
        setIndex={setIndex}
        setSuffix={totalSides === 2 ? ` · Side ${sideIndex + 1} of 2` : ''}
        color={color}
        anchor={anchor}
        anchorAlt={anchorAlt}
        bandUsed={bandUsed}
        bandTensions={bandTensions}
        onPickBand={(b) => {
          setBandUsed(b);
          onBandChange(b);
        }}
      />

      <View style={styles.ringWrap}>
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <PressableScale
            testID="timed-circle"
            accessibilityRole="button"
            accessibilityLabel={circleLabel}
            accessibilityHint={started ? 'Press and hold to end this hold early' : undefined}
            // The tap that starts the hold gets the bigger START buzz; a pause/resume tap a tick.
            haptic={
              tapAction === 'start' ? 'success' : tapAction === 'toggle' ? 'selection' : false
            }
            scaleTo={0.97}
            onPress={handleCirclePress}
            // Ending early is a real, recorded outcome — it logs the seconds actually held — so it
            // stays reachable at every phase the END EARLY button covered, including while the
            // session is paused. A long press keeps it off the screen without taking it away.
            onLongPress={started ? handleEndEarly : undefined}
            style={styles.ring}
          >
            <ProgressRing
              testID="timed-ring"
              progress={ringProgress}
              size={RING_SIZE}
              stroke={14}
              gradient={theme.gradients.trail}
              trackColor={withAlpha(color, 0.18)}
              animate={false}
            >
              <Txt
                variant="mega"
                testID="timed-remaining"
                color={stopped ? 'text2' : 'text'}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
                style={styles.ringNumeral}
              >
                {ringDisplay}
              </Txt>
              {ringUnit != null && (
                <Txt
                  variant="eyebrow"
                  testID="timed-remaining-unit"
                  color={stopped ? 'sky' : 'text3'}
                  style={styles.ringUnit}
                >
                  {ringUnit}
                </Txt>
              )}
            </ProgressRing>
          </PressableScale>
        </Animated.View>

        {/* Live only before the hold starts — once it is running, the ring itself is the control
            (tap to pause/resume), and there is nothing left here to adjust. They flank the ring
            from its lower corners, where the square around the circle is empty. */}
        {!started && (
          <>
            <IconButton
              testID="duration-minus"
              icon="remove"
              size="lg"
              accessibilityLabel="Decrease hold time by 5 seconds"
              style={styles.durationMinus}
              onPress={() => adjustDuration(-5)}
            />
            <IconButton
              testID="duration-plus"
              icon="add"
              size="lg"
              accessibilityLabel="Increase hold time by 5 seconds"
              style={styles.durationPlus}
              onPress={() => adjustDuration(5)}
            />
          </>
        )}
      </View>

      {/* What a tap means right now, under the ring rather than crammed inside it. */}
      <Txt
        variant="eyebrow"
        testID="timed-caption"
        color={stopped ? 'sky' : 'text2'}
        align="center"
        numberOfLines={1}
      >
        {circleCaption}
      </Txt>

      {/* The one thing a tap cannot say. Quiet, and only once there is a hold to end. */}
      {inHold && (
        <Txt testID="end-early-hint" variant="caption" color="text3" align="center">
          Press and hold to end early
        </Txt>
      )}

      <SetNavRow
        onRewind={onRewind}
        onSwap={onSwap}
        onSkip={onSkip}
        forwardIsSkip={forwardIsSkip}
      />
    </HeroCard>
  );
}

function RestPhase({
  restSec,
  nextLabel,
  nextName,
  nextSetText,
  restLine,
  pips,
  nextAnchor,
  nextAnchorAlt,
  nextBand,
  bandTensions,
  demoMedia,
  howTo,
  difficulty,
  onDifficultyChange,
  feedbackQuestion,
  onNext,
  onExtend,
}: {
  restSec: number;
  /** The whole "up next" line — exercise, set — as the rest-complete notification says it. */
  nextLabel: string;
  /** The same, split for the Up-next card: the exercise (or "Workout complete") ... */
  nextName: string;
  /** ...and which set of it, or null when there is no upcoming set. */
  nextSetText: string | null;
  /** The coach's line under REST, from the rest pool. */
  restLine: string;
  /** The set just performed, as pips: which sets of its exercise are done and which one just
   *  landed (that pip pops in when the page opens). Null if the entry can't be resolved. */
  pips: { done: boolean[]; justDone: number; color: string } | null;
  /** The fixed point the *next* exercise needs, or null when it needs none. */
  nextAnchor: Anchor | null;
  /** A second fixed point the next exercise works equally well from (`Exercise.anchor_alt`). */
  nextAnchorAlt: Anchor | null;
  /** The band the *next* set is prescribed, or null when it isn't a band exercise. Shown during
   *  rest so a band swap is something to do here, not something discovered after standing up. */
  nextBand: BandId | null;
  /** The user's own band colours/labels (spec §1140), for the `BandChip` above. */
  bandTensions: Record<BandId, usersRepo.BandTension>;
  /** The next exercise's demo video, so rest doubles as prep time — rig the anchor or check form
   *  before the set starts, rather than only after. Null when there is no upcoming exercise (the
   *  workout is ending) or nothing to demo (`DemoMedia` already returns null in that case; this is
   *  the case where there's no exercise at all to build the props from). Same `DemoMedia` props
   *  the exercise phase passes it, so it is the identical component in a second spot rather than a
   *  parallel implementation. */
  demoMedia: Omit<DemoMediaProps, 'defaultOpen'> | null;
  /** The next exercise's setup text — same source (`Exercise.setup`) as the exercise phase's own
   *  "How to" disclosure. Null under the same conditions as `demoMedia` (final rest, or no
   *  upcoming exercise to read it from). */
  howTo: string | null;
  difficulty: Difficulty | null;
  onDifficultyChange: (d: Difficulty | undefined) => void;
  /** The inline feedback question, or null when none is due on this rest (not the exercise's last
   *  set) or it is asked in a modal over this page instead. */
  feedbackQuestion: string | null;
  onNext: () => void;
  /** §10.7 — "+15s taps are recorded as a fatigue signal." Called only for +15 (never −15/Skip). */
  onExtend: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
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

  // Deliberately independent of the session-level pause: rest is its own clock, isolated from
  // the workout timer's pause/resume, and keeps counting down (and the background "rest complete"
  // notification stays scheduled) even while the session elapsed-time clock is frozen.

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

  const handleNext = () => {
    // Fire-and-forget, deliberately not awaited: this is best-effort background-notification
    // bookkeeping (see workoutNotifications.ts's own header), and awaiting it here used to mean a
    // native call that never resolves — expo-notifications has a documented history in this repo
    // of hanging/leaking under load (STATUS-4b, issue #14) — silently ate the tap on NEXT forever
    // on the last rest of a real workout, with the screen never moving on to Summary. The screen
    // must advance the instant the user asks, whether or not the stale-notification cleanup ever
    // finishes.
    void cancelRestNotification(notificationIdRef.current);
    notificationIdRef.current = null;
    onNext();
  };

  // The just-completed set's pip lands filled a beat after the page opens, so it pops in rather
  // than simply being there. Cleared on unmount.
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setLanded(true), 150);
    return () => clearTimeout(id);
  }, []);
  const pipFlags = pips ? pips.done.map((d, i) => (i === pips.justDone ? d && landed : d)) : null;

  // The ring drains as rest runs out. +15s can push the remaining time past what it started at, so
  // the denominator is the most time this rest has ever had left.
  const remainingMs = countdown.remainingMs;
  const mostMsRef = useRef(restSec * 1000);
  mostMsRef.current = Math.max(mostMsRef.current, remainingMs);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const pulse = usePulse(remainingSeconds >= 1 && remainingSeconds <= 3);

  return (
    <>
      {/* Rest is the coral mood: a coral border and ring so it is unmistakable at a glance from
          across a room. */}
      <Card variant="accent" tone="coral" padding="md" testID="rest-hero">
        <View style={styles.restBody}>
          <Txt variant="eyebrow" color="coral" align="center">
            Rest
          </Txt>
          <Txt variant="h2" align="center" testID="rest-line">
            {restLine}
          </Txt>
          {pips && pipFlags && (
            <View style={styles.restPips}>
              <Pips
                count={pipFlags.length}
                filled={pipFlags}
                color={pips.color}
                testID="rest-pips"
              />
              <Txt variant="eyebrow" color="text2">
                Set {pips.justDone + 1} of {pipFlags.length} done
              </Txt>
            </View>
          )}

          {/* Rest counts itself down and nothing here is pressable, so it should not look like the
              set timer, which is. */}
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <ProgressRing
              testID="rest-circle"
              progress={mostMsRef.current > 0 ? remainingMs / mostMsRef.current : 0}
              size={REST_RING_SIZE}
              stroke={14}
              gradient={theme.gradients.coral}
              trackColor={withAlpha(theme.colors.coral, 0.18)}
              animate={false}
            >
              <Txt
                variant="mega"
                testID="rest-remaining"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
                style={styles.ringNumeral}
              >
                {remainingSeconds}
              </Txt>
              <Txt variant="eyebrow" color="text3" style={styles.ringUnit}>
                sec
              </Txt>
            </ProgressRing>
          </Animated.View>

          <View style={styles.pillRow}>
            <PillButton
              testID="rest-minus-15"
              label="−15s"
              accessibilityLabel="Take 15 seconds off the rest"
              onPress={() => handleExtend(-15_000)}
            />
            <PillButton
              testID="rest-plus-15"
              label="+15s"
              accessibilityLabel="Add 15 seconds to the rest"
              onPress={() => handleExtend(15_000)}
            />
            <PillButton
              testID="rest-skip"
              label="Skip"
              accessibilityLabel="Skip the rest"
              onPress={handleSkip}
            />
          </View>

          {feedbackQuestion != null && (
            <>
              <Txt variant="eyebrow" color="text2" align="center" style={styles.feelLabel}>
                {feedbackQuestion}
              </Txt>
              <FeedbackControls difficulty={difficulty} onDifficultyChange={onDifficultyChange} />
            </>
          )}

          <Button
            testID="rest-next"
            label="NEXT"
            icon="arrowRight"
            iconRight
            size="lg"
            style={styles.completeButton}
            onPress={handleNext}
          />
        </View>
      </Card>

      <Card padding="md" testID="rest-up-next">
        <View style={styles.upNext}>
          <Txt variant="eyebrow" color="text3">
            Up next
          </Txt>
          <Txt variant="h2" numberOfLines={2}>
            {nextName}
          </Txt>
          {nextSetText != null && (
            <Txt variant="small" color="text2">
              {nextSetText}
            </Txt>
          )}
          {/* Rest is exactly when a user would go and rig the next anchor, and swap to the next
              band, so both are worth naming before the set rather than at the top of it. */}
          <View style={styles.chipRow}>
            <AnchorBadge anchor={nextAnchor} anchorAlt={nextAnchorAlt} testID="rest-next-anchor" />
            {nextBand != null && (
              <View testID="rest-next-band">
                <BandChip band={nextBand} tensions={bandTensions} />
              </View>
            )}
          </View>
        </View>
      </Card>

      {/* Same "How to" cue the exercise phase shows, read here for the *upcoming* exercise — rest
          is prep time, so the setup text is exactly as useful here as the demo below. */}
      {howTo && (
        <View testID="rest-how-to-block">
          <Disclosure title="How to" defaultOpen body={howTo} />
        </View>
      )}

      {/* Open by default here — rest is the moment to look, not a moment to also ask for a tap.
          The exercise phase's own DemoMedia (below, in the parent) keeps its own independent
          open/closed state once the set actually starts. */}
      {demoMedia && (
        <View testID="rest-demo-media-block">
          <DemoMedia {...demoMedia} defaultOpen />
        </View>
      )}
    </>
  );
}

/** −15s / +15s / Skip: a secondary pill with its label kept in natural case ("+15s", not "+15S"). */
function PillButton({
  testID,
  label,
  accessibilityLabel,
  onPress,
}: {
  testID: string;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={styles.pill}
      onPress={onPress}
    >
      <Txt variant="button" upper={false}>
        {label}
      </Txt>
    </PressableScale>
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
  const styles = useStyles();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card padding="md">
      <PressableScale
        testID="disclosure-toggle"
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        style={styles.disclosureHeader}
        onPress={() => setOpen((o) => !o)}
      >
        <View style={styles.disclosureTitle}>
          <Icon name="info" size={16} color="coral" style={styles.disclosureIcon} />
          <Txt variant="eyebrow" color="text2">
            {title}
          </Txt>
        </View>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} color="text3" />
      </PressableScale>
      {open && (
        <Txt variant="body" color="text2" style={styles.disclosureBody}>
          {body}
        </Txt>
      )}
    </Card>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.bg,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: gutter,
      paddingTop: space.xs,
      minHeight: 64,
    },
    // Both side groups are the same fixed width (two 36pt `sm` buttons and a gap) so the clock
    // between them stays centered whichever side has fewer buttons.
    barSide: { width: 80, flexDirection: 'row', alignItems: 'center', gap: space.sm },
    barSideRight: { justifyContent: 'flex-end' },
    clock: { flex: 1, textAlign: 'center' },
    segments: { marginHorizontal: gutter, marginTop: space.sm },
    scroll: { flex: 1 },
    container: { paddingHorizontal: gutter, paddingTop: space.md, gap: space.lg },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    metaSpacer: { flex: 1 },
    pausedChip: { alignSelf: 'flex-start' },
    swapNotice: {
      alignSelf: 'center',
      backgroundColor: t.tints.coral,
      borderRadius: radius.pill,
      paddingHorizontal: space.lg,
      paddingVertical: space.sm,
    },
    nudge: { gap: space.md },
    nudgeButtons: { gap: space.sm, marginTop: space.sm },

    // -- exercise hero (shared by the reps and timed views)
    heroPaused: { opacity: 0.55 },
    heroBody: { gap: space.md },
    setRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
    actionRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: space.xs },
    completeButton: { height: 72 },

    // -- reps: the counter is the centerpiece
    counter: { alignItems: 'center', gap: space.xs, paddingVertical: space.sm },
    counterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      alignSelf: 'stretch',
    },
    repCountInput: {
      ...textStyles.mega,
      flex: 1,
      height: 124,
      padding: 0,
      color: t.colors.text,
      textAlign: 'center',
    },

    // -- timed: the ring is the control
    ringWrap: {
      alignSelf: 'center',
      width: RING_SIZE,
      height: RING_SIZE,
      marginVertical: space.sm,
    },
    ring: { width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2 },
    ringNumeral: { width: 170, textAlign: 'center' },
    ringUnit: { marginTop: -space.sm },
    // The ±5s buttons sit outside the ring's lower corners (the square around a circle is empty
    // there), so the whole control still fits the card's width.
    durationMinus: { position: 'absolute', left: -28, bottom: 0 },
    durationPlus: { position: 'absolute', right: -28, bottom: 0 },

    // -- rest
    restBody: { gap: space.md, alignItems: 'center' },
    restPips: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    pillRow: { flexDirection: 'row', justifyContent: 'center', gap: space.sm },
    pill: {
      minHeight: 44,
      minWidth: 84,
      paddingHorizontal: space.lg,
      borderRadius: radius.pill,
      backgroundColor: t.colors.surface2,
      borderWidth: 1,
      borderColor: t.colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    feelLabel: { marginTop: space.sm },
    upNext: { gap: space.sm },

    // -- disclosure
    disclosureHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 32,
    },
    disclosureTitle: { flexDirection: 'row', alignItems: 'center' },
    disclosureIcon: { marginRight: space.sm },
    disclosureBody: { marginTop: space.md },
  }),
);
