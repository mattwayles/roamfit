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
  Modal,
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
import { completeSession, milestonesRepo, sessionsRepo } from '@roamfit/store';
import type { CompleteSessionResult } from '@roamfit/store';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { nowUtcInstant } from '../lib/localClock';
import {
  activeEntries,
  findCurrentEntry,
  sessionCursorPosition,
  type Section,
} from '../lib/sessionProgress';
import { buildCelebrationViewModel, type FullScreenCelebration } from '../lib/celebration';
import { hapticCompletion } from '../lib/workoutAudio';
import ConfettiBurst from '../components/ConfettiBurst';
import FeedbackControls, { type Difficulty } from '../components/FeedbackControls';

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
 * The set square's fill, and how much darker it gets when the square is also the "you are here"
 * override — reusing the app's own palette (the same green/blue/slate tokens Home already uses)
 * rather than inventing a parallel one for this screen.
 */
const SQUARE_COLORS: Record<SquareStatus, { bg: string; bgCurrent: string; text: string }> = {
  completed: { bg: '#16a34a', bgCurrent: '#166534', text: '#ffffff' },
  skipped: { bg: '#dbeafe', bgCurrent: '#1d4ed8', text: '#1e3a8a' },
  not_reached: { bg: '#e2e8f0', bgCurrent: '#64748b', text: '#334155' },
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

/**
 * §8.1 feedback: per SET for a `main` exercise (migration 0017) — a set can genuinely feel
 * different from its siblings (a band bumped up, fatigue by set 3), so a `main` answer is scoped
 * to one (entryId, setIndex) row in `set_logs`. `warmup`/`cooldown` feedback is still one shared
 * answer for the whole stage (`recordSectionFeedback` writes it to every entry in it, judged as
 * one block) — `setIndex: null` is that case, and it is always what a non-`main` entry's chip
 * passes.
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
  const [session, setSession] = useState<sessionsRepo.SessionRecord | null>(null);
  const [retrospective, setRetrospective] = useState('');
  const [result, setResult] = useState<CompleteSessionResult | null>(null);
  const [milestones, setMilestones] = useState<milestonesRepo.MilestoneRecord[]>([]);
  const [finished, setFinished] = useState(false);
  const [celebrationIndex, setCelebrationIndex] = useState(0);
  const [workoutCount, setWorkoutCount] = useState(0);
  // Which feedback is open for editing, or null when the popup is closed. `setIndex` is null for
  // a `warmup`/`cooldown` chip (the whole-stage answer); a `main` chip always names the one set
  // it came from — see `editFeedback`.
  const [editingFeedback, setEditingFeedback] = useState<{
    entryId: string;
    setIndex: number | null;
  } | null>(null);
  const bannerScale = useRef(new Animated.Value(0)).current;

  const reload = useCallback(() => {
    setSession(sessionsRepo.getSession(db, sessionId));
  }, [db, sessionId]);

  useFocusEffect(reload);

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

  // The "you are here" marker itself: a set explicitly picked from Summary (or carried over from
  // an earlier visit — `sessionCursorPosition` reads the persisted override) wins over the
  // derived front edge, regardless of how much of the workout is actually logged. Falls back to
  // `frontier` when there is no override, which is the original, purely-derived behavior.
  const cursor = session ? sessionCursorPosition(session) : null;
  const cursorEntry =
    session && cursor ? activeEntries(session).find((e) => e.id === cursor.entryId) : null;
  const youAreHere =
    cursor && cursorEntry ? { entry: cursorEntry, setIndex: cursor.setIndex } : frontier;

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
                calendar day, and (for `main`) now also carries its own feedback chips, so it needs
                the extra room.
                A `main` set's feedback lives on its own set_logs row (migration 0017 — sets of
                the same exercise can genuinely feel different), so its chip renders *inside* the
                square, scoped to exactly that set; tapping it opens the editor for that one set
                rather than the square's own jump-to-this-set press — nested Pressables each with
                their own `onPress` (the chip's, not just the square's), so a tap on the chip is
                the chip's alone. A `warmup`/`cooldown` set never carries this — that feedback is
                still one shared answer for the whole stage, rendered once below all the squares
                instead. */}
              <View style={styles.setSquareRow}>
                {Array.from({ length: setLineCount(entry) }, (_, setIndex) => {
                  const log = entry.setLogs.find((l) => l.setIndex === setIndex);
                  const status = squareStatus(log);
                  const colors = SQUARE_COLORS[status];
                  // §10.8 — the square *is* the "you are here" marker when the two coincide,
                  // rather than a duplicate marker drawn on top of it: a set that was skipped (or
                  // otherwise already logged) can still be the current position. `youAreHere` wins
                  // over the logged status here for exactly the same reason it wins everywhere
                  // else — a set explicitly picked from Summary is an override, regardless of what
                  // got recorded (or of whether anything has been recorded at all yet).
                  const isYouAreHere =
                    !!frontier &&
                    !!youAreHere &&
                    youAreHere.entry.id === entry.id &&
                    youAreHere.setIndex === setIndex;
                  const textColor = isYouAreHere ? '#ffffff' : colors.text;
                  return (
                    <Pressable
                      key={log?.id ?? `${entry.id}-${setIndex}`}
                      testID={log ? `summary-set-${log.id}` : `summary-set-${entry.id}-${setIndex}`}
                      accessibilityRole="button"
                      accessibilityLabel={
                        isYouAreHere
                          ? `Set ${setIndex + 1} — you are here`
                          : `Set ${setIndex + 1} — ${status.replace('_', ' ')}`
                      }
                      onPress={() => jumpToSet(entry.id, setIndex)}
                      style={[
                        styles.setSquare,
                        { backgroundColor: isYouAreHere ? colors.bgCurrent : colors.bg },
                        isYouAreHere && styles.setSquareCurrent,
                      ]}
                    >
                      <Text style={[styles.setSquareLabel, { color: textColor }]}>
                        Set {setIndex + 1}
                      </Text>
                      <Text style={styles.setSquareEmoji}>{statusEmoji(status)}</Text>
                      {isYouAreHere && (
                        <Text
                          style={styles.setSquareCurrentLabel}
                          testID={`summary-current-${entry.id}`}
                        >
                          You are here
                        </Text>
                      )}
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
                    </Pressable>
                  );
                })}
              </View>
              {/* Warm-up/cool-down only: one shared answer for the whole stage
                (`recordSectionFeedback`), so it is shown once here rather than on every square —
                a `main` entry's feedback is per-set instead (rendered inside each square above)
                and never reaches this block, since `entry.difficultyFeedback` is only ever
                written for `warmup`/`cooldown` now. Editable from here at any point before
                FINISH: pressing the chip reopens the exact controls the stage page offered,
                pre-filled with what is already recorded. */}
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
  // The "you are here" override: a bold, dark border on top of whatever the status fill already
  // darkened to, so the eye lands on it before it reads any of the labels — distinguishing it
  // from every other square has to work at a glance, not just on close reading.
  setSquareCurrent: { borderWidth: 3, borderColor: '#0f172a' },
  setSquareLabel: { fontSize: 13, fontWeight: '700' },
  setSquareEmoji: { fontSize: 22, marginTop: 2 },
  setSquareCurrentLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 2,
    textAlign: 'center',
  },
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
