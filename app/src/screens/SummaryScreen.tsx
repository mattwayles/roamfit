/**
 * §10.9 Summary & completion. Every set listed with actual vs. prescribed and status, an
 * optional retrospective textbox, then FINISH — the one call to `completeSession` (writes
 * history, progression, exercise state, milestones, and enqueues deferred work). Nothing here
 * computes progression or milestones itself; `../lib/celebration.ts` only shapes what
 * `completeSession` already decided into what to show and in what order.
 *
 * One completion screen, and it is LOUD. Finishing a session is the one thing this app should
 * never treat as routine: invariant 4 ("never punish") has a positive counterpart that isn't
 * written down anywhere else, which is to actually celebrate the win. The sequence, one beat
 * after another (see the choreography effect below):
 *   1. the fanfare, and a hype headline slammed in word by word, a haptic tick per word;
 *   2. the last word lands — heavy thump, screen shake, confetti cannons from both bottom
 *      corners, light rays fanning out behind the headline;
 *   3. the stat grid pops in tile by tile and counts up what actually happened (additive-only,
 *      per invariant 4: counts of what happened, never a comparison against the plan);
 *   4. §6.4/§6.7 — every level-up and Mastery best set this session earned stamps down on its
 *      own beat: its own sound, haptic, shake and confetti pop, the level bar filling. These used
 *      to be a separate step-through screen shown first; they are now this screen's crescendo;
 *   5. "Heck yes!" arrives last and keeps pulsing. Tapping the headline fires another burst.
 * Over a drifting glow-orb backdrop the whole time. All plain `Animated` API — the app has no
 * reanimated/lottie/svg library, and adding one costs a dev-client rebuild (BACKLOG). Reduce
 * Motion drops the shake and the endless loops, keeping the one-shot beats.
 *
 * §9.10: a one-tap native share sheet on each highlight. No image-rendering library is installed,
 * so this ships as RN's built-in `Share.share` with a formatted text card — a real share action,
 * not a rendered PNG (scope cut recorded in STATUS-5-motivation.md).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { completeSession, milestonesRepo, sessionsRepo, usersRepo } from '@roamfit/store';
import type { CompleteSessionResult } from '@roamfit/store';
import type { RootStackParamList } from '../navigation/types';
import { homeReset } from '../navigation/routes';
import { useStore } from '../state/StoreContext';
import { nowUtcInstant } from '../lib/localClock';
import { findCurrentEntry } from '../lib/sessionProgress';
import {
  buildCelebrationViewModel,
  pickHypeHeadline,
  type HighlightCelebration,
} from '../lib/celebration';
import { buildSessionCompletionStats } from '../lib/sessionStats';
import { lookupNewStamp, type NewStamp } from '../lib/newStamp';
import {
  cueLevelUp,
  cueStampImpact,
  cueSessionComplete,
  hapticCompletion,
  hapticHeavy,
  hapticTick,
} from '../lib/workoutAudio';
import { FOCUS_LABELS } from '../lib/focusLabels';
import ConfettiBurst, { type ConfettiVariant } from '../components/ConfettiBurst';
import CelebrationBackdrop, { Sunburst } from '../components/CelebrationBackdrop';
import HypeHeadline from '../components/HypeHeadline';
import {
  buildCompletionTimeline,
  HIGHLIGHT_SCROLL_LEAD_MS,
  STAMP_SETTLE_MS,
} from '../lib/completionTimeline';
import HighlightCard from '../components/HighlightCard';
import NewStampCard, { STAMP_IMPACT_MS } from '../components/NewStampCard';
import FeedbackControls, { type Difficulty } from '../components/FeedbackControls';
import AnimatedStatCounter from '../components/AnimatedStatCounter';
import BandChip from '../components/BandChip';
import KeyboardDoneBar from '../components/KeyboardDoneBar';
import { gutter, makeStyles, radius, space, type, useTheme, type AccentName } from '../theme';
import {
  Button,
  Card,
  Chip,
  Enter,
  Icon,
  PressableScale,
  Screen,
  SectionHeader,
  Sheet,
  StatTile,
  Txt,
} from '../ui';
import { useInsets } from '../ui/useInsets';

type Props = NativeStackScreenProps<RootStackParamList, 'Summary'>;

/** A set's status, whether it has a real log row or not — a set nobody has reached yet reads the
 *  same as a `not_reached` log would (that status exists in the schema but nothing currently
 *  writes it; absence of a row is how "not reached" actually shows up). */
type SquareStatus = 'completed' | 'skipped' | 'not_reached';

function squareStatus(log: sessionsRepo.SetLogRecord | undefined): SquareStatus {
  return log?.status ?? 'not_reached';
}

/** How many set lines to render for an entry: `entry.sets` normally, but never fewer than
 *  whatever is actually logged — a real set log always gets a line, even one logged past the
 *  nominal count. */
function setLineCount(entry: sessionsRepo.SessionEntryRecord): number {
  const maxLogged = entry.setLogs.reduce((max, l) => Math.max(max, l.setIndex + 1), 0);
  return Math.max(entry.sets, maxLogged);
}

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  too_easy: 'Too easy',
  just_right: 'Just right',
  too_hard: 'Too hard',
};

/** The same three tones as accent names, for the legacy whole-stage `Chip`. */
const DIFFICULTY_CHIP_TONE: Record<Difficulty, AccentName> = {
  too_easy: 'fern',
  just_right: 'teal',
  too_hard: 'summit',
};

type SquareStyles = { sqCompleted: ViewStyle; sqSkipped: ViewStyle; sqNotReached: ViewStyle };
const squareStyle = (st: SquareStyles, status: SquareStatus): ViewStyle =>
  status === 'completed' ? st.sqCompleted : status === 'skipped' ? st.sqSkipped : st.sqNotReached;

/** How each square is drawn (DESIGN.md §5.8): completed = teal fill, skipped = a quiet `text3`
 *  outline, not reached = a dashed outline (themed styles `sqCompleted` / `sqSkipped` / `sqNotReached`). (The dashed one uses `lineStrong`, one step brighter
 *  than the spec's `line`, so an unreached set stays findable on the `bg` night surface.) */

/** A session's focus as the friendly label ("Full body"), falling back to the raw key. */
function focusLabel(focus: string): string {
  return (FOCUS_LABELS as Record<string, string>)[focus] ?? focus;
}

function stampShareText(s: NewStamp): string {
  return `Just earned a new stamp in my Wanderlift passport — ${s.label}.`;
}

function celebrationShareText(c: HighlightCelebration): string {
  return c.kind === 'level_up'
    ? `Just leveled up in Wanderlift — ${c.familyName}, now training ${c.newExerciseName}.`
    : `New Mastery best set in Wanderlift — ${c.familyName}: ${c.exerciseName}${
        c.value !== null ? ` (${c.value})` : ''
      }.`;
}

/** "1st" / "2nd" / "3rd" / "4th"... for the completion banner. */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export default function SummaryScreen({ navigation, route }: Props): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  const { sessionId } = route.params;
  const { db, library, families } = useStore();
  const [session, setSession] = useState<sessionsRepo.SessionRecord | null>(null);
  const [retrospective, setRetrospective] = useState('');
  const [result, setResult] = useState<CompleteSessionResult | null>(null);
  const [milestones, setMilestones] = useState<milestonesRepo.MilestoneRecord[]>([]);
  const [finished, setFinished] = useState(false);
  const [workoutCount, setWorkoutCount] = useState(0);
  // The entry whose feedback is open for editing, or null when the popup is closed.
  const [editingFeedback, setEditingFeedback] = useState<string | null>(null);
  // Whether the edit sheet is showing. `editingFeedback` is left set when it closes, so the sheet's
  // content is still there while it slides away.
  const [editorOpen, setEditorOpen] = useState(false);
  // The completion screen's choreography state (see the effect that drives it below).
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const buttonPulse = useRef(new Animated.Value(0)).current;
  const raysVisible = useRef(new Animated.Value(0)).current;
  const headlineBounce = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  /** How many highlight cards have stamped down so far. */
  const [revealedHighlights, setRevealedHighlights] = useState(0);
  /** Every confetti burst currently in flight. Each mounts once and runs to completion; the list
   *  is capped so tapping the headline forever can't pile up thousands of views. */
  const [bursts, setBursts] = useState<
    { key: number; variant: ConfettiVariant; origin?: { x: number; y: number } }[]
  >([]);
  const burstKey = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const viewportHeight = useRef(0);
  const highlightsTop = useRef(0);
  const cardLayouts = useRef<{ y: number; height: number }[]>([]);
  /** Whether this session's Passport lookup is running, i.e. the timeline reserves a stamp beat. */
  const [stampSlot, setStampSlot] = useState(false);
  /** The Passport stamp this session earned, once the lookup has found one. */
  const [newStamp, setNewStamp] = useState<NewStamp | null>(null);
  const stampLookup = useRef<Promise<NewStamp | null> | null>(null);
  const stampLayout = useRef<{ y: number; height: number } | null>(null);
  const { width: windowWidth } = useWindowDimensions();
  const insets = useInsets();

  const reload = useCallback(() => {
    setSession(sessionsRepo.getSession(db, sessionId));
  }, [db, sessionId]);

  useFocusEffect(reload);

  const celebration = useMemo(
    () =>
      result
        ? buildCelebrationViewModel(library, families, result.progressionEvents, milestones)
        : { highlights: [], quiet: [] },
    [result, milestones, library, families],
  );

  // What actually happened this session, for the completion screen's stat grid — see
  // `sessionStats.ts`'s header for why this is a pure fold rather than a new store query.
  const completionStats = useMemo(
    () => (session ? buildSessionCompletionStats(session) : null),
    [session],
  );
  // Read-only — a completed session already implies a user row exists, but this never writes one
  // (unlike `ensureUser`), since this screen has no other reason to touch the users table.
  const bandTensions = useMemo(() => usersRepo.getUser(db)?.bandTensions ?? null, [db]);

  // §10.8 — the workout's own front edge. Non-null here means this screen is being viewed as a
  // real-time progress check on a still-in-progress workout (reached from the "Progress" button
  // on every page of the active workout), not the end-of-workout completion screen: FINISH and
  // the retrospective don't belong on a screen that isn't at the end yet.
  const frontier = session ? findCurrentEntry(session) : null;

  // This screen is reached from the middle of an active workout (WorkoutScreen's own "Progress"
  // button `replace`s it, so Workout is no longer under Summary on the stack), so the default
  // header back chevron and edge-swipe gesture have nothing correct to pop to — without this they
  // fall through to whatever screen was open *before* the workout started (Home, most of the
  // time), silently abandoning the session mid-review. Overriding both to run the same logic as
  // the in-page "Back to workout" button makes every way of leaving this screen land back on the
  // exact set it was opened from. Turned back off once FINISH has actually run: `completeSession`
  // has already happened by then, so replaying back into `Workout` would just re-open a completed
  // session and immediately bounce back here.
  const showingCompletionScreen = finished && result !== null;

  // The celebration is full-bleed: the sunburst and glow orbs run right up under the status bar,
  // so the native header steps aside once FINISH has run. Declared before the effect below so that
  // one stays the last `setOptions` call (the tests read the last call).
  useEffect(() => {
    if (showingCompletionScreen) navigation.setOptions({ headerShown: false });
  }, [navigation, showingCompletionScreen]);

  useEffect(() => {
    if (finished) {
      navigation.setOptions({ gestureEnabled: true, headerLeft: undefined });
      return;
    }
    if (!session) return;
    navigation.setOptions({
      gestureEnabled: false,
      headerLeft: () => (
        <PressableScale
          testID="summary-back"
          haptic={false}
          accessibilityRole="button"
          accessibilityLabel="Back to workout"
          onPress={() =>
            navigation.replace(
              'Workout',
              frontier ? { sessionId } : { sessionId, reviewFromSummary: true },
            )
          }
          style={styles.headerBack}
          hitSlop={8}
        >
          <Icon name="back" size={22} color="text" />
          <Txt variant="bodyStrong">Back</Txt>
        </PressableScale>
      ),
    });
  }, [navigation, sessionId, session, finished, frontier]);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) setReduceMotion(enabled);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const addBurst = useCallback(
    (variant: ConfettiVariant, origin?: { x: number; y: number }) => {
      // Reduce Motion (track 37n): no flying confetti; the haptics still celebrate.
      if (reduceMotion) return;
      burstKey.current += 1;
      const key = burstKey.current;
      setBursts((prev) => [...prev.slice(-5), { key, variant, origin }]);
    },
    [reduceMotion],
  );

  const shakeScreen = useCallback(
    (strength: number) => {
      if (reduceMotion) return;
      shake.setValue(0);
      Animated.sequence(
        [1, -0.8, 0.6, -0.4, 0.2, 0].map((f) =>
          Animated.timing(shake, { toValue: f * strength, duration: 45, useNativeDriver: true }),
        ),
      ).start();
    },
    [reduceMotion, shake],
  );

  // Every stat tile this session earns — additive facts only (invariant 4): a count of something
  // that happened, never a comparison against the plan. A dimension earns a tile only when it
  // actually applies this session (no "0 reps" tile on an all-timed session, no "0s" tile on an
  // all-reps one).
  const statTiles: { key: string; value: number; label: string; suffix?: string }[] = useMemo(
    () =>
      completionStats
        ? [
            { key: 'sets', value: completionStats.setsCompleted, label: 'Sets' },
            ...(completionStats.totalReps > 0
              ? [{ key: 'reps', value: completionStats.totalReps, label: 'Total reps' }]
              : []),
            ...(completionStats.totalSeconds > 0
              ? [
                  {
                    key: 'seconds',
                    value: completionStats.totalSeconds,
                    label: 'Time under tension',
                    suffix: 's',
                  },
                ]
              : []),
            { key: 'exercises', value: completionStats.exercisesTrained, label: 'Exercises' },
          ]
        : [],
    [completionStats],
  );

  const hypeHeadline = pickHypeHeadline(sessionId);
  const timeline = useMemo(
    () =>
      buildCompletionTimeline(
        hypeHeadline.split(' ').length,
        statTiles.length,
        celebration.highlights.length,
        stampSlot,
      ),
    [hypeHeadline, statTiles.length, celebration.highlights.length, stampSlot],
  );

  // The whole completion choreography, run once when the screen appears. Every beat is a timer
  // off `timeline` (`lib/completionTimeline.ts`), the same clock the stat tiles' own animation
  // delays read, so sound, haptics and animation can't drift apart:
  //   words        fanfare; headline words slam in, a tick per word
  //   slam         last word: heavy thump + shake + confetti cannons + light rays
  //   content      count text fades up; each stat tile pops with its own tick
  //   highlights   each level-up/Mastery card stamps down (`cueLevelUp`, shake, confetti pop),
  //                scrolled into view first if it's below the fold
  //   stamp        Passport on: a new place's stamp slams down (`NewStampCard`), after the lookup
  //                that started at FINISH has answered — "Heck yes!" waits for it, never forever
  //   button       a Success pulse and "Heck yes!" springs in, then keeps pulsing
  useEffect(() => {
    if (!showingCompletionScreen) return;

    contentOpacity.setValue(0);
    buttonOpacity.setValue(0);
    raysVisible.setValue(0);
    setRevealedHighlights(0);
    setNewStamp(null);

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const loops: { stop: () => void }[] = [];

    cueSessionComplete();

    timeline.wordTicks.forEach((ms) => at(ms, hapticTick));
    at(timeline.slam, () => {
      hapticHeavy();
      shakeScreen(9);
      addBurst('cannons');
      Animated.spring(raysVisible, { toValue: 1, friction: 6, useNativeDriver: true }).start();
    });
    at(timeline.content, () => {
      Animated.timing(contentOpacity, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    });
    timeline.statTiles.forEach((ms) => at(ms, hapticTick));
    at(timeline.statsDone, () => addBurst('rain'));

    timeline.highlights.forEach((revealAt, i) => {
      // Bring the card on screen before it lands — a level-up that stamps down below the fold is
      // a level-up nobody saw.
      at(revealAt - HIGHLIGHT_SCROLL_LEAD_MS, () => {
        const card = cardLayouts.current[i];
        if (!card) return;
        const cardBottom = highlightsTop.current + card.y + card.height;
        const target = cardBottom - viewportHeight.current + 110;
        if (target > scrollY.current) scrollRef.current?.scrollTo({ y: target, animated: true });
      });
      at(revealAt, () => {
        setRevealedHighlights(i + 1);
        cueLevelUp();
        shakeScreen(6);
        const card = cardLayouts.current[i];
        addBurst(
          'pop',
          card
            ? {
                x: windowWidth / 2,
                y: highlightsTop.current + card.y + card.height / 2 - scrollY.current,
              }
            : undefined,
        );
      });
    });

    const showButton = () => {
      hapticCompletion();
      Animated.spring(buttonOpacity, {
        toValue: 1,
        friction: 4,
        tension: 80,
        useNativeDriver: true,
      }).start();
      if (!reduceMotion) {
        const pulse = Animated.loop(
          Animated.sequence([
            Animated.timing(buttonPulse, { toValue: 1, duration: 650, useNativeDriver: true }),
            Animated.timing(buttonPulse, { toValue: 0, duration: 650, useNativeDriver: true }),
          ]),
        );
        pulse.start();
        loops.push(pulse);
      }
    };

    if (timeline.stamp === null) {
      at(timeline.button, showButton);
    } else {
      at(timeline.stamp, () => {
        const lookup = stampLookup.current;
        if (!lookup) return showButton();
        void lookup.then((found) => {
          if (cancelled) return;
          if (!found) return showButton();
          setNewStamp(found);
          // The card mounts and runs its own flight; this is the rest of the beat around it.
          // Scroll first (the stamp slamming below the fold is a stamp nobody saw), keeping the
          // card's heading in view when the card is taller than the room.
          at(80, () => {
            const card = stampLayout.current;
            if (!card) return;
            const target = Math.min(
              card.y + card.height - viewportHeight.current + 110,
              card.y - 24,
            );
            if (target > scrollY.current)
              scrollRef.current?.scrollTo({ y: target, animated: true });
          });
          at(STAMP_IMPACT_MS + 150, () => addBurst('rain'));
          at(STAMP_IMPACT_MS + 350, hapticCompletion);
          at(STAMP_IMPACT_MS + STAMP_SETTLE_MS, showButton);
        });
      });
    }

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      loops.forEach((l) => l.stop());
    };
    // Deliberately keyed only on the screen appearing: re-running on a reduce-motion flip or a
    // rotation would replay the whole sequence from the top (no react-hooks lint plugin is
    // configured in this project to flag the omission).
  }, [showingCompletionScreen]);

  /** The stamp's moment of contact — the first stamping and every tap-to-restamp. The card owns
   *  the flight and the squash; this is the screen's half: the thunk and its three-beat haptic,
   *  the shake, and a confetti pop from the stamp's own spot on the page. */
  const handleStampImpact = () => {
    cueStampImpact();
    shakeScreen(8);
    const card = stampLayout.current;
    addBurst(
      'pop',
      card ? { x: windowWidth / 2, y: card.y + card.height * 0.45 - scrollY.current } : undefined,
    );
  };

  const handleHeadlinePress = () => {
    hapticHeavy();
    shakeScreen(5);
    addBurst('pop', { x: windowWidth / 2, y: 150 - scrollY.current });
    if (reduceMotion) return;
    headlineBounce.setValue(1);
    Animated.spring(headlineBounce, {
      toValue: 0,
      friction: 3,
      tension: 140,
      useNativeDriver: true,
    }).start();
  };

  if (!session)
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.colors.teal} />
      </View>
    );

  const jumpToSet = (entryId: string, setIndex: number) => {
    navigation.replace('Workout', { sessionId, jumpTo: { entryId, setIndex } });
  };

  /** The entry the feedback popup is open for, and the value it should show — read fresh off
   *  `session` on every render rather than snapshotted at the moment the chip was tapped, so an
   *  edit is reflected immediately without closing and reopening the popup. */
  const editingFeedbackEntry = editingFeedback
    ? session.entries.find((e) => e.id === editingFeedback)
    : null;
  const editingFeedbackDifficulty = editingFeedbackEntry?.difficultyFeedback ?? null;

  const handleEditDifficultyChange = (d: Difficulty | undefined) => {
    if (!editingFeedbackEntry) return;
    sessionsRepo.recordEntryFeedback(
      db,
      editingFeedbackEntry.id,
      { difficulty: d ?? null },
      nowUtcInstant(),
    );
    reload();
  };

  const handleShare = (text: string) => {
    // Fire-and-forget, matches §9.10 "never auto-posts" — this only opens the native share sheet;
    // where it goes from there is entirely the user's.
    void Share.share({ message: text });
  };

  if (finished && result) {
    return (
      <View style={styles.doneScreen} testID="session-complete">
        <CelebrationBackdrop still={reduceMotion} />
        <Animated.View style={[styles.flex, { transform: [{ translateX: shake }] }]}>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[
              styles.doneContainer,
              {
                paddingTop: insets.top + space.lg,
                paddingBottom: insets.bottom + space.xl,
                paddingLeft: gutter + insets.left,
                paddingRight: gutter + insets.right,
              },
            ]}
            scrollEventThrottle={16}
            onScroll={(e) => {
              scrollY.current = e.nativeEvent.contentOffset.y;
            }}
            onLayout={(e) => {
              viewportHeight.current = e.nativeEvent.layout.height;
            }}
          >
            <View style={styles.hero}>
              <Sunburst size={windowWidth * 1.6} visible={raysVisible} still={reduceMotion} />
              <Pressable
                testID="hype-headline"
                onPress={handleHeadlinePress}
                accessibilityRole="button"
                accessibilityLabel={hypeHeadline}
                accessibilityHint="Fires more confetti"
              >
                <HypeHeadline text={hypeHeadline} bounce={headlineBounce} />
              </Pressable>
            </View>

            <Animated.View
              style={[
                styles.doneContent,
                {
                  opacity: contentOpacity,
                  transform: [
                    {
                      translateY: contentOpacity.interpolate({
                        inputRange: [0, 1],
                        outputRange: [16, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Txt variant="h2" align="center" testID="workout-count">
                You just finished your {ordinal(workoutCount)} workout on Wanderlift!
              </Txt>

              <Txt variant="small" color="text2" align="center">
                {Math.round(result.actualMinutes)} min · {focusLabel(session.focus)}
              </Txt>
            </Animated.View>

            {statTiles.length > 0 && (
              <View testID="completion-stats" style={styles.statGrid}>
                {statTiles.map((tile, i) => (
                  <AnimatedStatCounter
                    key={tile.key}
                    testID={`completion-stat-${tile.key}`}
                    value={tile.value}
                    label={tile.label}
                    suffix={tile.suffix}
                    delay={timeline.statTiles[i]}
                    style={styles.statTile}
                  />
                ))}
              </View>
            )}

            <Animated.View style={[styles.doneContent, { opacity: contentOpacity }]}>
              {completionStats?.heaviestBand && bandTensions && (
                <View style={styles.bandRow} testID="completion-band">
                  <Txt variant="small" color="text2">
                    Heaviest band used
                  </Txt>
                  <BandChip band={completionStats.heaviestBand} tensions={bandTensions} />
                </View>
              )}
            </Animated.View>

            {celebration.highlights.length > 0 && (
              <View
                testID="completion-highlights"
                style={styles.highlights}
                onLayout={(e: LayoutChangeEvent) => {
                  highlightsTop.current = e.nativeEvent.layout.y;
                }}
              >
                <Animated.View style={{ opacity: contentOpacity }}>
                  <Txt
                    variant="eyebrow"
                    color="gold"
                    align="center"
                    style={styles.highlightsHeading}
                  >
                    {celebration.highlights.length === 1
                      ? 'AND THAT’S NOT ALL…'
                      : `AND THAT’S NOT ALL… ×${celebration.highlights.length}`}
                  </Txt>
                </Animated.View>
                {celebration.highlights.map((h, i) => (
                  <View
                    key={i}
                    style={styles.flexRow}
                    onLayout={(e: LayoutChangeEvent) => {
                      cardLayouts.current[i] = {
                        y: e.nativeEvent.layout.y,
                        height: e.nativeEvent.layout.height,
                      };
                    }}
                  >
                    <HighlightCard
                      testID={`highlight-${i}`}
                      highlight={h}
                      revealed={i < revealedHighlights}
                      still={reduceMotion}
                      onShare={() => handleShare(celebrationShareText(h))}
                    />
                  </View>
                ))}
              </View>
            )}

            {newStamp && (
              <View
                style={styles.flexRow}
                onLayout={(e: LayoutChangeEvent) => {
                  stampLayout.current = {
                    y: e.nativeEvent.layout.y,
                    height: e.nativeEvent.layout.height,
                  };
                }}
              >
                <NewStampCard
                  testID="new-stamp"
                  stamp={newStamp}
                  still={reduceMotion}
                  onImpact={handleStampImpact}
                  onShare={() => handleShare(stampShareText(newStamp))}
                />
              </View>
            )}

            {celebration.quiet.length > 0 && (
              <Animated.View
                testID="quiet-milestones"
                style={[styles.quietMilestones, { opacity: contentOpacity }]}
              >
                {celebration.quiet.map((m, i) => (
                  <Chip key={i} tone="gold" icon="star" wrap label={m.text} />
                ))}
              </Animated.View>
            )}

            <Animated.View
              style={[
                styles.doneButtonWrap,
                {
                  opacity: buttonOpacity.interpolate({
                    inputRange: [0, 0.4],
                    outputRange: [0, 1],
                    extrapolate: 'clamp',
                  }),
                  transform: [
                    {
                      scale: Animated.multiply(
                        buttonOpacity.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
                        buttonPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }),
                      ),
                    },
                  ],
                },
              ]}
            >
              {/* The pulse breathes the glow too: this halo brightens and swells with the same
                  `buttonPulse` value that scales the button (both native-driven). */}
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.buttonHalo,
                  {
                    opacity: buttonPulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.18, 0.7],
                    }),
                    transform: [
                      {
                        scale: buttonPulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.1],
                        }),
                      },
                    ],
                  },
                ]}
              />
              <Button
                testID="return-home"
                label="Heck yes! 💪"
                size="lg"
                haptic={false}
                onPress={() => {
                  hapticHeavy();
                  navigation.reset(homeReset());
                }}
              />
            </Animated.View>
          </ScrollView>
        </Animated.View>

        <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="confetti-burst">
          {bursts.map((b) => (
            <ConfettiBurst key={b.key} variant={b.variant} origin={b.origin} />
          ))}
        </View>
      </View>
    );
  }

  const handleFinish = () => {
    const completion = completeSession(
      db,
      { sessionId, library, families, retrospective: retrospective || undefined },
      nowUtcInstant(),
    );
    // Passport on: ask for the place right now, in the background of the whole celebration, so a
    // new stamp can slam down as its finale instead of landing silently on Journey later.
    const passportOn = usersRepo.getUser(db)?.passportEnabled === true;
    stampLookup.current = passportOn ? lookupNewStamp(db, sessionId) : null;
    setStampSlot(passportOn);
    setResult(completion);
    setMilestones(milestonesRepo.getMilestonesForSession(db, sessionId));
    setWorkoutCount(sessionsRepo.countCompletedSessions(db));
    setFinished(true);
  };

  const retrospectiveAccessoryId = 'retrospective-accessory';
  const activeEntries = session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
  const backToWorkout = () =>
    navigation.replace(
      'Workout',
      frontier ? { sessionId } : { sessionId, reviewFromSummary: true },
    );
  const openFeedbackEditor = (entryId: string) => {
    setEditingFeedback(entryId);
    setEditorOpen(true);
  };
  const editingFeedbackSets =
    editingFeedbackEntry?.setLogs.filter((l) => l.status === 'completed').length ?? 0;
  const editingExerciseName = editingFeedbackEntry
    ? (library.exercises.find((e) => e.id === editingFeedbackEntry.exerciseId)?.name ??
      editingFeedbackEntry.exerciseId)
    : '';

  return (
    <>
      <Screen
        scroll
        adjustForKeyboard
        contentStyle={styles.debrief}
        footer={
          <View style={styles.footer}>
            {!frontier && (
              <Button
                testID="finish-button"
                label="Finish"
                size="lg"
                haptic={false}
                onPress={handleFinish}
              />
            )}
            {/* The session is still `active` in the DB at this point — nothing is finalized until
              FINISH is tapped — so going back to it is genuinely resuming, not reopening
              something already closed. Gone once FINISH is tapped (the completion screen has no
              equivalent button): completeSession has run by then and there is nothing active left
              to return to. A still-in-progress workout (frontier not null — this is a real-time
              progress check, not the end-of-workout screen) simply resumes at the front edge, and
              there "Back to workout" is the one primary button; only the fully-logged, pre-FINISH
              case needs `reviewFromSummary` to land on the last set instead of bouncing straight
              back here (see WorkoutScreen's review-mode handling). */}
            <Button
              testID="back-to-workout"
              label="Back to workout"
              variant={frontier ? 'primary' : 'quiet'}
              size={frontier ? 'lg' : 'md'}
              onPress={backToWorkout}
            />
          </View>
        }
      >
        <Enter index={0} style={styles.titleBlock}>
          <Txt variant="eyebrow" color="gold">
            Debrief
          </Txt>
          <Txt variant="h1" accessibilityRole="header">
            {focusLabel(session.focus)} · {session.targetMinutes} min
          </Txt>
        </Enter>

        {/* Additive counts of what happened, never "of planned" (invariant 4). Reps and timed holds
            are different units, so the third tile shows reps when there are any and only falls back
            to hold seconds for a session that has none. */}
        {completionStats && (
          <Enter index={1} style={styles.tileRow}>
            <StatTile
              testID="debrief-stat-sets"
              size="h1"
              tone="teal"
              value={completionStats.setsCompleted}
              label="Sets done"
              style={styles.tile}
            />
            <StatTile
              testID="debrief-stat-exercises"
              size="h1"
              tone="gold"
              value={completionStats.exercisesTrained}
              label="Exercises"
              style={styles.tile}
            />
            <StatTile
              testID="debrief-stat-reps"
              size="h1"
              tone="fern"
              value={
                completionStats.totalReps > 0 || completionStats.totalSeconds === 0
                  ? completionStats.totalReps
                  : `${completionStats.totalSeconds}s`
              }
              label={
                completionStats.totalReps > 0 || completionStats.totalSeconds === 0
                  ? 'Reps'
                  : 'Hold time'
              }
              style={styles.tile}
            />
          </Enter>
        )}

        <Enter index={2} style={styles.legend} testID="debrief-legend">
          <LegendItem status="completed" label="done" />
          <LegendItem status="skipped" label="skipped" />
          <LegendItem status="not_reached" label="not reached" />
        </Enter>

        <Enter index={3}>
          <Card padding="none">
            {activeEntries.map((entry, i) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                name={
                  library.exercises.find((e) => e.id === entry.exerciseId)?.name ?? entry.exerciseId
                }
                last={i === activeEntries.length - 1}
                onJump={(setIndex) => jumpToSet(entry.id, setIndex)}
                onEditFeedback={() => openFeedbackEditor(entry.id)}
              />
            ))}
          </Card>
        </Enter>

        {!frontier && (
          <Enter index={4}>
            <Card padding="md" style={styles.notes}>
              <SectionHeader title="Trail notes" icon="pin" tone="gold" />
              <TextInput
                testID="retrospective-input"
                style={styles.notesInput}
                value={retrospective}
                onChangeText={setRetrospective}
                placeholder="What felt great? Anything to tweak next time?"
                placeholderTextColor={theme.colors.text3}
                selectionColor={theme.colors.teal}
                keyboardAppearance={theme.scheme}
                multiline
                inputAccessoryViewID={retrospectiveAccessoryId}
              />
              {/* A multiline field's return key has to mean "newline", so it can't also mean
                  "dismiss the keyboard" — the shared bar gives the keyboard its own explicit Done
                  without taking paragraph breaks away. */}
              <KeyboardDoneBar nativeID={retrospectiveAccessoryId} testID="retrospective-done" />
            </Card>
          </Enter>
        )}
      </Screen>

      {/* Editing an already-recorded feedback answer, at any point before FINISH — same controls
          the rest page shows, reopened here rather than requiring a walk back through the workout.
          `editingFeedback` is kept after closing (only `editorOpen` flips) so the sheet's content
          survives its exit animation. */}
      <Sheet
        testID="feedback-edit-sheet"
        visible={editorOpen && editingFeedbackEntry !== null}
        onClose={() => setEditorOpen(false)}
        title={editingExerciseName}
      >
        <View style={styles.sheetBody}>
          <Txt variant="small" color="text2">
            {`How did ${editingFeedbackSets === 1 ? 'that set' : `those ${editingFeedbackSets} sets`} feel?`}
          </Txt>
          <FeedbackControls
            difficulty={editingFeedbackDifficulty}
            onDifficultyChange={handleEditDifficultyChange}
          />
          <Button
            testID="feedback-edit-done"
            label="Done"
            variant="secondary"
            size="md"
            onPress={() => setEditorOpen(false)}
          />
        </View>
      </Sheet>
    </>
  );
}

// -- Debrief pieces ---------------------------------------------------------------------------

function LegendItem({ status, label }: { status: SquareStatus; label: string }): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, squareStyle(styles, status)]} />
      <Txt variant="caption" color="text2">
        {label}
      </Txt>
    </View>
  );
}

/**
 * One exercise: its name on the left, a wrapping run of 30pt set squares on the right. One square
 * per set in the plan, not just the ones with a log — a set nobody has reached yet still gets a
 * tap target, because `jumpToSet` accepts any `setIndex < entry.sets` (WorkoutScreen's `jumpTo`
 * never restricted itself to sets already reached).
 *
 * Feedback is one answer for the exercise (asked after its last set), shown as a chip under the
 * name: the answer when there is one, otherwise a quiet "How did it feel?" prompt — the way back to
 * a question that was skipped. Either way, tapping it opens the editor. Only an exercise with at
 * least one completed set gets a chip; there is nothing to rate before that.
 */
function EntryRow({
  entry,
  name,
  last,
  onJump,
  onEditFeedback,
}: {
  entry: sessionsRepo.SessionEntryRecord;
  name: string;
  last: boolean;
  onJump: (setIndex: number) => void;
  onEditFeedback: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  const railColor = (theme.section as Record<string, string>)[entry.section] ?? theme.colors.teal;
  return (
    <View
      testID={`summary-${entry.exerciseId}`}
      style={[styles.entryRow, !last && styles.entryRowDivider]}
    >
      <View style={[styles.rail, { backgroundColor: railColor }]} />
      <View style={styles.entryName}>
        <Txt variant="h3" numberOfLines={2}>
          {name}
        </Txt>
        {entry.setLogs.some((l) => l.status === 'completed') &&
          (entry.difficultyFeedback ? (
            <Chip
              testID={`summary-feedback-difficulty-${entry.id}`}
              size="sm"
              label={DIFFICULTY_LABEL[entry.difficultyFeedback]}
              tone={DIFFICULTY_CHIP_TONE[entry.difficultyFeedback]}
              onPress={onEditFeedback}
            />
          ) : (
            <Chip
              testID={`summary-feedback-placeholder-${entry.id}`}
              size="sm"
              label="How did it feel?"
              onPress={onEditFeedback}
            />
          ))}
      </View>
      <View style={styles.squares}>
        {Array.from({ length: setLineCount(entry) }, (_, setIndex) => {
          const log = entry.setLogs.find((l) => l.setIndex === setIndex);
          const status = squareStatus(log);
          const count =
            log?.status === 'completed' ? (log.repsActual ?? log.secondsActual ?? null) : null;
          return (
            <View key={log?.id ?? `${entry.id}-${setIndex}`} style={styles.setColumn}>
              <PressableScale
                testID={log ? `summary-set-${log.id}` : `summary-set-${entry.id}-${setIndex}`}
                haptic={false}
                accessibilityRole="button"
                accessibilityLabel={`Set ${setIndex + 1} — ${status.replace('_', ' ')}`}
                // 30pt squares: 7pt above and below reach the 44pt minimum; sideways stays at 5pt
                // so a square never steals its neighbour's tap (track 37n).
                hitSlop={{ top: 7, bottom: 7, left: 5, right: 5 }}
                onPress={() => onJump(setIndex)}
                style={[styles.square, squareStyle(styles, status)]}
              >
                {status === 'completed' ? (
                  count !== null ? (
                    <Txt
                      variant="eyebrow"
                      color="ink"
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                      style={styles.squareCount}
                    >
                      {count}
                    </Txt>
                  ) : (
                    <Icon name="check" size={16} color="ink" />
                  )
                ) : null}
              </PressableScale>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const SQUARE = 30;

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.bg,
    },

    sqCompleted: { backgroundColor: t.setState.completed, borderColor: t.setState.completed },
    sqSkipped: { backgroundColor: 'transparent', borderColor: t.setState.skipped },
    sqNotReached: {
      backgroundColor: 'transparent',
      borderColor: t.colors.lineStrong,
      borderStyle: 'dashed',
    },

    // -- debrief
    headerBack: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.xs,
      paddingRight: space.sm,
    },
    debrief: { paddingTop: space.sm, gap: space.lg },
    titleBlock: { gap: space.xs },
    tileRow: { flexDirection: 'row', gap: space.sm },
    tile: { flex: 1, minWidth: 0, padding: space.md },
    legend: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
    legendSwatch: { width: 12, height: 12, borderRadius: 4, borderWidth: 1.5 },
    entryRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.md,
      paddingVertical: space.md,
      paddingLeft: space.lg,
      paddingRight: space.md,
    },
    entryRowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.line,
    },
    // A 3pt strip in the section's colour (gold warm-up / teal main / fern cool-down), so the
    // rows read as the route they walked without a section header eating a line.
    rail: {
      position: 'absolute',
      left: 0,
      top: space.md,
      bottom: space.md,
      width: 3,
      borderTopRightRadius: 2,
      borderBottomRightRadius: 2,
    },
    entryName: { flex: 1, minWidth: 96, gap: space.xs, paddingTop: 4 },
    squares: { flexShrink: 0, maxWidth: '62%', flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    setColumn: { alignItems: 'center', width: SQUARE },
    square: {
      width: SQUARE,
      height: SQUARE,
      borderRadius: 9,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Tracking override on a Txt variant: the eyebrow's 1.6 spacing would crowd a 30pt square.
    squareCount: { letterSpacing: 0 },
    // Reserved even for a set with no dot, so every square in a wrapped row lines up.
    notes: { gap: space.md },
    notesInput: {
      ...type.body,
      minHeight: 76,
      color: t.colors.text,
      backgroundColor: t.colors.surface2,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: t.colors.line,
      paddingHorizontal: space.md,
      paddingTop: space.md,
      paddingBottom: space.md,
      textAlignVertical: 'top',
    },
    footer: { gap: space.xs },
    sheetBody: { gap: space.lg },

    // The completion celebration (invariant 4/§1.1 in reverse — the one screen meant to be loud),
    // re-skinned into Midnight (DESIGN.md §5.9): `bg` night base under the glow orbs, gold
    // accents, no violet. Spacing is tight so headline + stats + the first highlight sit above the
    // fold on a 6.1" phone.
    flex: { flex: 1 },
    flexRow: { width: '100%' },
    doneScreen: { flex: 1, backgroundColor: t.colors.bg, overflow: 'hidden' },
    doneContainer: { flexGrow: 1, alignItems: 'center', gap: space.md },
    hero: {
      width: '100%',
      minHeight: 132,
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneContent: { alignItems: 'center', gap: space.xs, width: '100%' },
    statGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: space.sm + 2,
      width: '100%',
    },
    statTile: { flexBasis: '46%', flexGrow: 1 },
    bandRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    highlights: { width: '100%', gap: space.md },
    // Wider tracking than the eyebrow token for this one heading.
    highlightsHeading: { letterSpacing: 2 },
    quietMilestones: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: space.sm,
      width: '100%',
    },
    doneButtonWrap: { alignSelf: 'stretch', marginTop: space.xs },
    buttonHalo: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: radius.pill,
      // Decoration behind the CTA, no text on it: vivid teal in both modes (DESIGN.md §8.1).
      backgroundColor: t.vivid.teal,
      ...t.glow(t.vivid.teal),
    },
  }),
);
