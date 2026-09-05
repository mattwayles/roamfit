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
 *
 * The plain completion screen underneath those (no level-up, or every one already stepped
 * through) is deliberately loud too — confetti, haptics, a big banner, and the user's running
 * workout count. Finishing a session is the one thing this app should never treat as routine:
 * invariant 4 ("never punish") has a positive counterpart that isn't written down anywhere else,
 * which is to actually celebrate the win. `ConfettiBurst` is a plain `Animated`-API component,
 * not a new dependency — the app has no confetti/lottie/reanimated library installed.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  InputAccessoryView,
  Keyboard,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { completeSession, milestonesRepo, sessionsRepo, usersRepo } from '@roamfit/store';
import type { CompleteSessionResult } from '@roamfit/store';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { nowUtcInstant } from '../lib/localClock';
import { findCurrentEntry } from '../lib/sessionProgress';
import { buildCelebrationViewModel, type FullScreenCelebration } from '../lib/celebration';
import { hapticCompletion } from '../lib/workoutAudio';
import ConfettiBurst from '../components/ConfettiBurst';

type Props = NativeStackScreenProps<RootStackParamList, 'Summary'>;

function statusIcon(status: string): string {
  if (status === 'completed') return '✅';
  // A neutral "skip" glyph, not a warning — invariant 4: a skipped set is a choice, not a
  // problem the icon should read as flagging.
  if (status === 'skipped') return '⏭';
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

/**
 * The band that set was actually trained with, in the user's own words for it.
 *
 * Per-set rather than per-exercise on purpose: `bandActual` is recorded on every set log, and a
 * user who moves up a band partway through an exercise did two different amounts of work. The
 * summary is where they check what they actually did, so collapsing that to one band per exercise
 * would report a set nobody performed. Blank for bodyweight work and for a set that never ran.
 */
function setBandText(
  log: sessionsRepo.SetLogRecord,
  tensions: Record<string, usersRepo.BandTension>,
): string {
  if (log.status !== 'completed' || !log.bandActual) return '';
  return ` · ${tensions[log.bandActual]?.label ?? log.bandActual}`;
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
  // The user's own names for their bands, so a set line reads "Red" rather than "B2".
  const bandTensions = usersRepo.ensureUser(db, nowUtcInstant()).bandTensions;
  const [session, setSession] = useState<sessionsRepo.SessionRecord | null>(null);
  const [retrospective, setRetrospective] = useState('');
  const [result, setResult] = useState<CompleteSessionResult | null>(null);
  const [milestones, setMilestones] = useState<milestonesRepo.MilestoneRecord[]>([]);
  const [finished, setFinished] = useState(false);
  const [celebrationIndex, setCelebrationIndex] = useState(0);
  const [workoutCount, setWorkoutCount] = useState(0);
  const bannerScale = useRef(new Animated.Value(0)).current;

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

  // The plain completion screen, after every full-screen level-up/mastery celebration has been
  // stepped through (or there were none) — invariant 4/§1.1 territory in reverse: this is the one
  // moment that's allowed, even meant, to be as loud as possible. Haptics + the banner's bounce-in
  // fire exactly once, when this screen first becomes visible.
  const showingCompletionScreen =
    finished && result !== null && celebrationIndex >= celebration.fullScreen.length;

  useEffect(() => {
    if (!showingCompletionScreen) return;
    hapticCompletion();
    bannerScale.setValue(0);
    Animated.spring(bannerScale, {
      toValue: 1,
      friction: 4,
      tension: 55,
      useNativeDriver: true,
    }).start();
  }, [showingCompletionScreen, bannerScale]);

  if (!session) return <View style={styles.centered} />;

  const jumpToSet = (entryId: string, setIndex: number) => {
    navigation.replace('Workout', { sessionId, jumpTo: { entryId, setIndex } });
  };

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
      <View style={styles.doneScreen} testID="session-complete">
        <ConfettiBurst />
        <ScrollView contentContainerStyle={styles.doneContainer}>
          <Animated.View style={{ transform: [{ scale: bannerScale }] }}>
            <Text style={styles.doneBannerEmoji}>🎉🙌🎉</Text>
            <Text style={styles.doneBanner}>CONGRATULATIONS!</Text>
          </Animated.View>

          <Text style={styles.doneCountText} testID="workout-count">
            You just finished your {ordinal(workoutCount)} workout on RoamFit!
          </Text>

          <Text style={styles.doneSubtitle}>
            {Math.round(result.actualMinutes)} min · {session.focus}
          </Text>

          {celebration.quiet.length > 0 && (
            <View testID="quiet-milestones" style={styles.quietMilestones}>
              {celebration.quiet.map((m, i) => (
                <Text key={i} style={styles.quietMilestoneText}>
                  ⭐ {m.text}
                </Text>
              ))}
            </View>
          )}

          <Pressable
            testID="return-home"
            style={styles.doneFinishButton}
            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
          >
            <Text style={styles.doneFinishButtonText}>Heck yes!</Text>
          </Pressable>
        </ScrollView>
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
    setCelebrationIndex(0);
    setWorkoutCount(sessionsRepo.countCompletedSessions(db));
    setFinished(true);
  };

  const retrospectiveAccessoryId = 'retrospective-accessory';

  return (
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
            {entry.setLogs.map((log) => (
              <Pressable
                key={log.id}
                testID={`summary-set-${log.id}`}
                onPress={() => jumpToSet(entry.id, log.setIndex)}
              >
                <Text style={styles.setLine}>
                  {statusIcon(log.status)} Set {log.setIndex + 1}: {setResultText(log)}
                  {setBandText(log, bandTensions)}
                  {entry.difficultyFeedback ? ` · ${entry.difficultyFeedback}` : ''}
                  {entry.enjoymentFeedback ? ` · ${entry.enjoymentFeedback}/5` : ''}
                </Text>
              </Pressable>
            ))}
            {/* §10.8 — a bold "you are here" line for the entry the front edge is currently on,
                only meaningful while the workout is still in progress (frontier is null once
                everything is logged). Pressable like every other set line, landing on exactly
                this bookmark — a no-op if you're already looking at it. */}
            {frontier && frontier.entry.id === entry.id && (
              <Pressable
                testID={`summary-current-${entry.id}`}
                onPress={() => jumpToSet(entry.id, frontier.setIndex)}
              >
                <Text style={styles.currentSetLine}>
                  ▶ Set {frontier.setIndex + 1} — you are here
                </Text>
              </Pressable>
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
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1 },
  container: { padding: 20, gap: 12 },
  heading: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  entryBlock: { gap: 2 },
  entryName: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  setLine: { fontSize: 13, color: '#475569' },
  currentSetLine: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
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
  doneScreen: { flex: 1, backgroundColor: '#7c3aed' },
  doneContainer: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 64,
    alignItems: 'center',
    gap: 14,
  },
  doneBannerEmoji: { fontSize: 40, textAlign: 'center' },
  doneBanner: {
    fontSize: 34,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  doneCountText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fef9c3',
    textAlign: 'center',
  },
  doneSubtitle: { fontSize: 14, color: '#e9d5ff', textAlign: 'center' },
  quietMilestones: {
    gap: 6,
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    padding: 14,
    width: '100%',
  },
  quietMilestoneText: { fontSize: 13, color: '#fff', fontWeight: '600' },
  doneFinishButton: {
    marginTop: 20,
    backgroundColor: '#facc15',
    borderRadius: 20,
    paddingHorizontal: 32,
    paddingVertical: 20,
    alignItems: 'center',
    minHeight: 60,
    justifyContent: 'center',
  },
  doneFinishButtonText: { color: '#713f12', fontSize: 18, fontWeight: '900' },
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
