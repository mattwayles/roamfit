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
  Animated,
  InputAccessoryView,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { completeSession, milestonesRepo, sessionsRepo, usersRepo } from '@roamfit/store';
import type { CompleteSessionResult } from '@roamfit/store';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { nowUtcInstant } from '../lib/localClock';
import { findCurrentEntry, type Section } from '../lib/sessionProgress';
import {
  buildCelebrationViewModel,
  pickHypeHeadline,
  type HighlightCelebration,
} from '../lib/celebration';
import { buildSessionCompletionStats } from '../lib/sessionStats';
import {
  cueLevelUp,
  cueSessionComplete,
  hapticCompletion,
  hapticHeavy,
  hapticTick,
} from '../lib/workoutAudio';
import ConfettiBurst, { type ConfettiVariant } from '../components/ConfettiBurst';
import CelebrationBackdrop, { Sunburst } from '../components/CelebrationBackdrop';
import HypeHeadline from '../components/HypeHeadline';
import { buildCompletionTimeline, HIGHLIGHT_SCROLL_LEAD_MS } from '../lib/completionTimeline';
import HighlightCard from '../components/HighlightCard';
import FeedbackControls, { type Difficulty } from '../components/FeedbackControls';
import AnimatedStatCounter from '../components/AnimatedStatCounter';
import BandChip from '../components/BandChip';

type Props = NativeStackScreenProps<RootStackParamList, 'Summary'>;

/** A set's status, whether it has a real log row or not — a set nobody has reached yet reads the
 *  same as a `not_reached` log would (that status exists in the schema but nothing currently
 *  writes it; absence of a row is how "not reached" actually shows up). */
type SquareStatus = 'completed' | 'skipped' | 'not_reached';

function squareStatus(log: sessionsRepo.SetLogRecord | undefined): SquareStatus {
  return log?.status ?? 'not_reached';
}

/** The emoji each set square shows under its "Set N" label — a neutral glyph for every status,
 *  never a warning (invariant 4: a skipped set is a choice, and a not-yet-reached one hasn't
 *  happened yet, neither is a problem to flag). */
function statusEmoji(status: SquareStatus): string {
  if (status === 'completed') return '✅';
  if (status === 'skipped') return '⏭';
  return '⬜';
}

/**
 * The set square's fill — reusing the app's own palette (the same green/blue/slate tokens Home
 * already uses) rather than inventing a parallel one for this screen.
 */
const SQUARE_COLORS: Record<SquareStatus, { bg: string; text: string }> = {
  completed: { bg: '#16a34a', text: '#ffffff' },
  skipped: { bg: '#dbeafe', text: '#1e3a8a' },
  not_reached: { bg: '#e2e8f0', text: '#334155' },
};

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

/** A color per answer, not a neutral chip for all three — amber/green/red reads at a glance,
 *  the same way the set squares' own status fill does. Light background + a dark same-hue text,
 *  matching the app's other badges/chips (e.g. Home's mastery badge, the skipped square). */
const DIFFICULTY_COLORS: Record<Difficulty, { bg: string; text: string }> = {
  too_easy: { bg: '#fde68a', text: '#713f12' },
  just_right: { bg: '#dcfce7', text: '#166534' },
  too_hard: { bg: '#fee2e2', text: '#991b1b' },
};

/** Neutral fill for the "no feedback yet" placeholder chip — same slate the not-yet-reached
 *  square itself uses, so it reads as "nothing recorded" rather than as a fourth answer. */
const PLACEHOLDER_CHIP_COLORS = { bg: '#e2e8f0', text: '#475569' };

/**
 * §8.1 feedback: per SET, for every section (migration 0017 gave `main` this first; warm-up and
 * cool-down now get it too, on their own rest timer, instead of one shared question asked at the
 * end of the stage) — a set can genuinely feel different from its siblings (a band bumped up,
 * fatigue by set 3), so the answer is scoped to one `(entryId, setIndex)` row in `set_logs`.
 *
 * `setIndex: null` only ever shows up now when editing a whole-stage answer left over from a
 * session recorded before this change — `recordSectionFeedback` still exists to let that legacy
 * chip be edited, but nothing currently active writes a new one.
 */
function editFeedback(
  db: ReturnType<typeof useStore>['db'],
  sessionId: string,
  entry: sessionsRepo.SessionEntryRecord,
  setIndex: number | null,
  feedback: { difficulty?: Difficulty | null },
  now: string,
): void {
  if (setIndex !== null) {
    sessionsRepo.recordSetFeedback(db, entry.id, setIndex, feedback, now);
  } else {
    sessionsRepo.recordSectionFeedback(db, sessionId, entry.section as Section, feedback, now);
  }
}

function celebrationShareText(c: HighlightCelebration): string {
  return c.kind === 'level_up'
    ? `Just leveled up in RoamFit — ${c.familyName}, now training ${c.newExerciseName}.`
    : `New Mastery best set in RoamFit — ${c.familyName}: ${c.exerciseName}${
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
  const { sessionId } = route.params;
  const { db, library, families } = useStore();
  const [session, setSession] = useState<sessionsRepo.SessionRecord | null>(null);
  const [retrospective, setRetrospective] = useState('');
  const [result, setResult] = useState<CompleteSessionResult | null>(null);
  const [milestones, setMilestones] = useState<milestonesRepo.MilestoneRecord[]>([]);
  const [finished, setFinished] = useState(false);
  const [workoutCount, setWorkoutCount] = useState(0);
  // Which feedback is open for editing, or null when the popup is closed. `setIndex` is null for
  // a `warmup`/`cooldown` chip (the whole-stage answer); a `main` chip always names the one set
  // it came from — see `editFeedback`.
  const [editingFeedback, setEditingFeedback] = useState<{
    entryId: string;
    setIndex: number | null;
  } | null>(null);
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
  const { width: windowWidth } = useWindowDimensions();

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
  useEffect(() => {
    if (finished) {
      navigation.setOptions({ gestureEnabled: true, headerLeft: undefined });
      return;
    }
    if (!session) return;
    navigation.setOptions({
      gestureEnabled: false,
      headerLeft: () => (
        <Pressable
          testID="summary-back"
          onPress={() =>
            navigation.replace(
              'Workout',
              frontier ? { sessionId } : { sessionId, reviewFromSummary: true },
            )
          }
          style={styles.headerBackButton}
          hitSlop={8}
        >
          <Text style={styles.headerBackButtonText}>‹ Back</Text>
        </Pressable>
      ),
    });
  }, [navigation, sessionId, session, finished, frontier]);

  const showingCompletionScreen = finished && result !== null;

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

  const addBurst = useCallback((variant: ConfettiVariant, origin?: { x: number; y: number }) => {
    burstKey.current += 1;
    const key = burstKey.current;
    setBursts((prev) => [...prev.slice(-5), { key, variant, origin }]);
  }, []);

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
      ),
    [hypeHeadline, statTiles.length, celebration.highlights.length],
  );

  // The whole completion choreography, run once when the screen appears. Every beat is a timer
  // off `timeline` (`lib/completionTimeline.ts`), the same clock the stat tiles' own animation
  // delays read, so sound, haptics and animation can't drift apart:
  //   words        fanfare; headline words slam in, a tick per word
  //   slam         last word: heavy thump + shake + confetti cannons + light rays
  //   content      count text fades up; each stat tile pops with its own tick
  //   highlights   each level-up/Mastery card stamps down (`cueLevelUp`, shake, confetti pop),
  //                scrolled into view first if it's below the fold
  //   button       a Success pulse and "Heck yes!" springs in, then keeps pulsing
  useEffect(() => {
    if (!showingCompletionScreen) return;

    contentOpacity.setValue(0);
    buttonOpacity.setValue(0);
    raysVisible.setValue(0);
    setRevealedHighlights(0);

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

    at(timeline.button, () => {
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
    });

    return () => {
      timers.forEach(clearTimeout);
      loops.forEach((l) => l.stop());
    };
    // Deliberately keyed only on the screen appearing: re-running on a reduce-motion flip or a
    // rotation would replay the whole sequence from the top (no react-hooks lint plugin is
    // configured in this project to flag the omission).
  }, [showingCompletionScreen]);

  const handleHeadlinePress = () => {
    hapticHeavy();
    shakeScreen(5);
    addBurst('pop', { x: windowWidth / 2, y: 150 - scrollY.current });
    headlineBounce.setValue(1);
    Animated.spring(headlineBounce, {
      toValue: 0,
      friction: 3,
      tension: 140,
      useNativeDriver: true,
    }).start();
  };

  if (!session) return <View style={styles.centered} />;

  const jumpToSet = (entryId: string, setIndex: number) => {
    navigation.replace('Workout', { sessionId, jumpTo: { entryId, setIndex } });
  };

  /** The entry (and, for a `main` chip, the specific set) the feedback popup is open for, and the
   *  value it should show — read fresh off `session` on every render rather than snapshotted at
   *  the moment the chip was tapped, so an edit is reflected immediately without closing and
   *  reopening the popup. */
  const editingFeedbackEntry = editingFeedback
    ? session.entries.find((e) => e.id === editingFeedback.entryId)
    : null;
  const editingFeedbackLog =
    editingFeedbackEntry && editingFeedback && editingFeedback.setIndex !== null
      ? editingFeedbackEntry.setLogs.find((l) => l.setIndex === editingFeedback.setIndex)
      : null;
  const editingFeedbackDifficulty =
    editingFeedback?.setIndex !== null
      ? (editingFeedbackLog?.difficultyFeedback ?? null)
      : (editingFeedbackEntry?.difficultyFeedback ?? null);

  const handleEditDifficultyChange = (d: Difficulty | undefined) => {
    if (!editingFeedback || !editingFeedbackEntry) return;
    editFeedback(
      db,
      sessionId,
      editingFeedbackEntry,
      editingFeedback.setIndex,
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
            contentContainerStyle={styles.doneContainer}
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
              <Text style={styles.doneCountText} testID="workout-count">
                You just finished your {ordinal(workoutCount)} workout on RoamFit!
              </Text>

              <Text style={styles.doneSubtitle}>
                {Math.round(result.actualMinutes)} min · {session.focus}
              </Text>
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
                    valueStyle={styles.statTileValue}
                  />
                ))}
              </View>
            )}

            <Animated.View style={[styles.doneContent, { opacity: contentOpacity }]}>
              {completionStats?.heaviestBand && bandTensions && (
                <View style={styles.bandRow} testID="completion-band">
                  <Text style={styles.bandRowLabel}>Heaviest band used</Text>
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
                <Animated.Text style={[styles.highlightsHeading, { opacity: contentOpacity }]}>
                  {celebration.highlights.length === 1
                    ? 'AND THAT’S NOT ALL…'
                    : `AND THAT’S NOT ALL… ×${celebration.highlights.length}`}
                </Animated.Text>
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

            {celebration.quiet.length > 0 && (
              <Animated.View
                testID="quiet-milestones"
                style={[styles.quietMilestones, { opacity: contentOpacity }]}
              >
                {celebration.quiet.map((m, i) => (
                  <Text key={i} style={styles.quietMilestoneText}>
                    ⭐ {m.text}
                  </Text>
                ))}
              </Animated.View>
            )}

            <Animated.View
              style={{
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
              }}
            >
              <Pressable
                testID="return-home"
                style={styles.doneFinishButton}
                onPress={() => {
                  hapticHeavy();
                  navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
                }}
              >
                <Text style={styles.doneFinishButtonText}>Heck yes! 💪</Text>
              </Pressable>
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
    setResult(completion);
    setMilestones(milestonesRepo.getMilestonesForSession(db, sessionId));
    setWorkoutCount(sessionsRepo.countCompletedSessions(db));
    setFinished(true);
  };

  const retrospectiveAccessoryId = 'retrospective-accessory';

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
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
              {/* One square per set in the plan, not just the ones with a log — a set nobody has
                reached yet used to have no line at all, which made it impossible to jump ahead
                to it from here. `jumpToSet` already accepted any setIndex < entry.sets
                (WorkoutScreen's jumpTo never restricted itself to sets already reached); this
                just wasn't offering the tap target. Styled after the Home screen's calendar
                heatmap cells (same rounded-square shape, same green/neutral fill logic), scaled
                up — a set is a much less numerous, much more consequential thing to tap than a
                calendar day, and it now also carries its own feedback chip, so it needs the extra
                room.
                Every set's feedback lives on its own set_logs row (migration 0017 — sets of the
                same exercise can genuinely feel different), so its chip renders *inside* the
                square, scoped to exactly that set; tapping it opens the editor for that one set
                rather than the square's own jump-to-this-set press — nested Pressables each with
                their own `onPress` (the chip's, not just the square's), so a tap on the chip is
                the chip's alone. */}
              <View style={styles.setSquareRow}>
                {Array.from({ length: setLineCount(entry) }, (_, setIndex) => {
                  const log = entry.setLogs.find((l) => l.setIndex === setIndex);
                  const status = squareStatus(log);
                  const colors = SQUARE_COLORS[status];
                  return (
                    <Pressable
                      key={log?.id ?? `${entry.id}-${setIndex}`}
                      testID={log ? `summary-set-${log.id}` : `summary-set-${entry.id}-${setIndex}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Set ${setIndex + 1} — ${status.replace('_', ' ')}`}
                      onPress={() => jumpToSet(entry.id, setIndex)}
                      style={[styles.setSquare, { backgroundColor: colors.bg }]}
                    >
                      <Text style={[styles.setSquareLabel, { color: colors.text }]}>
                        Set {setIndex + 1}
                      </Text>
                      <Text style={styles.setSquareEmoji}>{statusEmoji(status)}</Text>
                      {/* A `main` set's own feedback — nested inside the square's own Pressable
                          rather than a sibling, since a chip has to win over the square's own
                          jump-to-this-set press when tapped: each chip carries its own `onPress`,
                          which the touch responder gives priority to over the square underneath
                          it. */}
                      {log && log.difficultyFeedback && (
                        <View style={styles.setSquareFeedbackRow}>
                          <Pressable
                            testID={`summary-feedback-difficulty-${log.id}`}
                            hitSlop={4}
                            onPress={() => setEditingFeedback({ entryId: entry.id, setIndex })}
                            style={[
                              styles.setSquareFeedbackChip,
                              { backgroundColor: DIFFICULTY_COLORS[log.difficultyFeedback].bg },
                            ]}
                          >
                            <Text
                              style={[
                                styles.setSquareFeedbackChipText,
                                { color: DIFFICULTY_COLORS[log.difficultyFeedback].text },
                              ]}
                            >
                              {DIFFICULTY_LABEL[log.difficultyFeedback]}
                            </Text>
                          </Pressable>
                        </View>
                      )}
                      {/* A logged set (completed or skipped) that never got an answer on the rest
                          screen — the rest screen only ever asks once, so there was previously no
                          way back to it. `recordSetFeedback` no-ops without a set_logs row, so this
                          only offers the tap target once a log actually exists (`not_reached` sets
                          get nothing to tap, same as before). */}
                      {log && !log.difficultyFeedback && (
                        <View style={styles.setSquareFeedbackRow}>
                          <Pressable
                            testID={`summary-feedback-placeholder-${log.id}`}
                            hitSlop={4}
                            onPress={() => setEditingFeedback({ entryId: entry.id, setIndex })}
                            style={[
                              styles.setSquareFeedbackChip,
                              { backgroundColor: PLACEHOLDER_CHIP_COLORS.bg },
                            ]}
                          >
                            <Text
                              style={[
                                styles.setSquareFeedbackChipText,
                                { color: PLACEHOLDER_CHIP_COLORS.text },
                              ]}
                            >
                              + Feedback
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
              {/* Legacy only: a whole-stage answer (`recordSectionFeedback`) from a session
                recorded before warm-up/cool-down got their own per-set rest timer and feedback.
                Nothing writes a new one — every entry's feedback is per-set now (rendered inside
                each square above) — but a session that already has one still shows and can still
                be edited here. */}
              {entry.section !== 'main' && entry.difficultyFeedback && (
                <View style={styles.feedbackChipRow}>
                  <Pressable
                    testID={`summary-feedback-difficulty-${entry.id}`}
                    style={[
                      styles.feedbackChip,
                      { backgroundColor: DIFFICULTY_COLORS[entry.difficultyFeedback].bg },
                    ]}
                    onPress={() => setEditingFeedback({ entryId: entry.id, setIndex: null })}
                  >
                    <Text
                      style={[
                        styles.feedbackChipText,
                        { color: DIFFICULTY_COLORS[entry.difficultyFeedback].text },
                      ]}
                    >
                      {DIFFICULTY_LABEL[entry.difficultyFeedback]}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}

        {!frontier && (
          <>
            <Text style={styles.sectionLabel}>Retrospective (optional)</Text>
            <TextInput
              testID="retrospective-input"
              style={styles.retrospectiveInput}
              value={retrospective}
              onChangeText={setRetrospective}
              placeholder="How did that feel?"
              multiline
              inputAccessoryViewID={retrospectiveAccessoryId}
            />
            {/* `InputAccessoryView` is iOS-only, which is the only platform this app ships on. A
              plain `returnKeyType="done"` would have to double as "insert newline" on a multiline
              field, so it can't also mean "dismiss the keyboard" without giving up typing
              paragraph breaks. This gives the keyboard its own explicit Done button without
              taking that away. */}
            <InputAccessoryView nativeID={retrospectiveAccessoryId}>
              <View style={styles.keyboardAccessory}>
                <Pressable
                  testID="retrospective-done"
                  onPress={() => Keyboard.dismiss()}
                  style={styles.keyboardAccessoryButton}
                >
                  <Text style={styles.keyboardAccessoryButtonText}>Done</Text>
                </Pressable>
              </View>
            </InputAccessoryView>

            <Pressable testID="finish-button" style={styles.finishButton} onPress={handleFinish}>
              <Text style={styles.finishButtonText}>FINISH</Text>
            </Pressable>
          </>
        )}

        {/* The session is still `active` in the DB at this point — nothing is finalized until
          FINISH is tapped above — so going back to it is genuinely resuming, not reopening
          something already closed. Gone once FINISH is tapped (the `finished` screens below have
          no equivalent button): completeSession has run by then and there is nothing active left
          to return to. A still-in-progress workout (frontier not null — this is a real-time
          progress check, not the end-of-workout screen) simply resumes at the front edge; only
          the fully-logged, pre-FINISH case needs `reviewFromSummary` to land on the last set
          instead of bouncing straight back here (see WorkoutScreen's review-mode handling). */}
        <Pressable
          testID="back-to-workout"
          style={styles.backButton}
          onPress={() =>
            navigation.replace(
              'Workout',
              frontier ? { sessionId } : { sessionId, reviewFromSummary: true },
            )
          }
        >
          <Text style={styles.backButtonText}>Back to workout</Text>
        </Pressable>
      </ScrollView>

      {/* Editing an already-recorded feedback answer, at any point before FINISH — same controls
          the rest/stage page shows, reopened here rather than requiring a walk back through the
          workout. Same backdrop-dialog shape as Home's day-marker edit popup, for one consistent
          "edit something in place from a summary view" pattern across the app. */}
      <Modal
        visible={editingFeedbackEntry !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingFeedback(null)}
      >
        <Pressable style={styles.feedbackBackdrop} onPress={() => setEditingFeedback(null)}>
          <Pressable style={styles.feedbackDialog} onPress={() => {}}>
            {editingFeedbackEntry && (
              <>
                <Text style={styles.feedbackDialogTitle}>
                  {editingFeedback?.setIndex !== null
                    ? `${
                        library.exercises.find((e) => e.id === editingFeedbackEntry.exerciseId)
                          ?.name ?? editingFeedbackEntry.exerciseId
                      } — Set ${(editingFeedback?.setIndex ?? 0) + 1}`
                    : editingFeedbackEntry.section === 'warmup'
                      ? 'Warm-up'
                      : 'Cool-down'}
                </Text>
                <FeedbackControls
                  difficulty={editingFeedbackDifficulty}
                  onDifficultyChange={handleEditDifficultyChange}
                />
              </>
            )}
            <Pressable
              testID="feedback-edit-done"
              style={styles.feedbackDialogDone}
              onPress={() => setEditingFeedback(null)}
            >
              <Text style={styles.feedbackDialogDoneText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1 },
  container: { padding: 20, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  entryBlock: { gap: 6 },
  entryName: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  // Sized well past the Home screen's calendar-heatmap cells (§14.1.6's ~40px flex cells) — a
  // set square is a much rarer, much more deliberate tap than a calendar day, and (for `main`)
  // now also has to fit its own feedback chips, so it earns a bigger target still than the plain
  // label+emoji version did. Same shape language otherwise: rounded square, color-coded fill,
  // centered content.
  setSquareRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  setSquare: {
    width: 92,
    height: 92,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  setSquareLabel: { fontSize: 13, fontWeight: '700' },
  setSquareEmoji: { fontSize: 22, marginTop: 2 },
  // A `main` set's own feedback, inside the square — a small colored chip (color carries the
  // answer at a glance, same as the square's own status fill), so it costs the square only a
  // little extra room even with a real label instead of a bare glyph.
  setSquareFeedbackRow: { flexDirection: 'row', gap: 4, marginTop: 2 },
  setSquareFeedbackChip: { borderRadius: 999, paddingVertical: 2, paddingHorizontal: 6 },
  setSquareFeedbackChipText: { fontSize: 8, fontWeight: '700', textAlign: 'center' },
  feedbackChipRow: { flexDirection: 'row', gap: 8 },
  feedbackChip: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  feedbackChipText: { fontSize: 13, fontWeight: '600' },
  feedbackBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  feedbackDialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  feedbackDialogTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  feedbackDialogDone: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  feedbackDialogDoneText: { fontSize: 14, fontWeight: '700', color: '#1d4ed8' },
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
  headerBackButton: { paddingHorizontal: 8, paddingVertical: 6 },
  headerBackButtonText: { color: '#2563eb', fontSize: 16, fontWeight: '600' },
  keyboardAccessory: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: '#f1f5f9',
    padding: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#cbd5e1',
  },
  keyboardAccessoryButton: { paddingHorizontal: 12, paddingVertical: 6 },
  keyboardAccessoryButtonText: { color: '#2563eb', fontSize: 16, fontWeight: '700' },
  // The completion celebration (invariant 4/§1.1 in reverse — the one screen meant to be loud).
  flex: { flex: 1 },
  flexRow: { width: '100%' },
  doneScreen: { flex: 1, backgroundColor: '#5b21b6', overflow: 'hidden' },
  doneContainer: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 48,
    paddingBottom: 48,
    alignItems: 'center',
    gap: 18,
  },
  hero: {
    width: '100%',
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneContent: { alignItems: 'center', gap: 6, width: '100%' },
  doneCountText: {
    fontSize: 19,
    fontWeight: '800',
    color: '#fef9c3',
    textAlign: 'center',
  },
  doneSubtitle: { fontSize: 14, fontWeight: '600', color: '#e9d5ff', textAlign: 'center' },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  statTile: {
    flexBasis: '46%',
    flexGrow: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 18,
    paddingVertical: 14,
  },
  statTileValue: { fontSize: 34, fontWeight: '900' },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bandRowLabel: { fontSize: 13, color: '#e9d5ff', fontWeight: '600' },
  highlights: { width: '100%', gap: 18, marginTop: 6 },
  highlightsHeading: {
    fontSize: 15,
    fontWeight: '900',
    color: '#fde047',
    textAlign: 'center',
    letterSpacing: 2,
  },
  quietMilestones: {
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    padding: 14,
    width: '100%',
  },
  quietMilestoneText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  doneFinishButton: {
    marginTop: 12,
    backgroundColor: '#facc15',
    borderRadius: 999,
    paddingHorizontal: 44,
    paddingVertical: 20,
    alignItems: 'center',
    minHeight: 64,
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  doneFinishButtonText: { color: '#422006', fontSize: 20, fontWeight: '900' },
});
