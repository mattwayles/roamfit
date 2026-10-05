/**
 * One exercise, in full: everything the library record carries, the "How to" cue, the demo video,
 * and what this user's own history says about getting stronger at it.
 *
 * **The video here is the same video the workout screen shows.** It goes through the same
 * `DemoMedia` component and the same `exerciseStateRepo.assignUserVideo` / `clearUserVideo` calls,
 * writing the same `exercise_state.user_video_id` column — one video per exercise, two places it
 * can be set and two places it renders. No new field, no second source of truth, and nothing to
 * reconcile if a link is pasted here rather than mid-set.
 *
 * The progression block answers "have I got stronger at this?" from `set_logs` — reps, held
 * seconds, sets and band all count (`lib/exerciseProgress.ts`). It never re-derives a prescription
 * or a level: the engine owns those, and this screen only reports what already happened.
 *
 * Every field is shown by default. The user asked for all of it up front, on the understanding
 * that whatever turns out to be noise gets trimmed later — so the "Details" grid below is
 * deliberately exhaustive rather than curated. Only its *presentation* is friendlier: a full-bleed
 * focus-colour hero, stat tiles, section cards and a two-column spec grid instead of one long wall
 * of label/value text (DESIGN.md §5.4).
 *
 * The native header is off: the hero runs to the top of the screen and carries its own back
 * button. The edge-swipe back gesture is untouched.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { exerciseCatalogRepo, exerciseStateRepo, remoteConfigRepo } from '@roamfit/store';
import { levelOrdinal } from '@roamfit/engine';
import type { Exercise } from '@roamfit/data';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { localDateFromDate, nowUtcInstant } from '../lib/localClock';
import { ProgressChart } from '../components/ProgressChart';
import DemoMedia from '../components/DemoMedia';
import PinnedNote from '../components/PinnedNote';
import { EmptyState } from '../components/EmptyState';
import { IconBadge } from '../components/IconBadge';
import { formatToken, primaryMuscleLabel } from '../lib/exerciseCatalog';
import {
  buildExerciseProgress,
  formatLocalDate,
  gainLines,
  progressSummary,
  unitLabel,
} from '../lib/exerciseProgress';
import { FOCUS_TONE } from '../lib/focusLabels';
import {
  gutter,
  makeStyles,
  radius,
  space,
  useTheme,
  type AccentName,
  type GradientColors,
  type Theme,
} from '../theme';
import {
  Card,
  Chip,
  Enter,
  Gradient,
  Icon,
  IconButton,
  PressableScale,
  Screen,
  StatTile,
  Switch,
  TopoPattern,
  Txt,
  type IconName,
} from '../ui';
import { useInsets } from '../ui/useInsets';

type Props = NativeStackScreenProps<RootStackParamList, 'ExerciseDetail'>;

/** Hero gradient per focus tone. Cardio's rose has no themed gradient (it is an identity color,
 *  not a CTA one), so it borrows the rose -> pineDeep pair from the theme's palette. */
function heroGradient(theme: Theme, tone: AccentName): GradientColors {
  return theme.accentGradient[tone] ?? [theme.colors.rose, theme.colors.pineDeep];
}

interface DetailData {
  catalog: exerciseCatalogRepo.ExerciseCatalogState;
  history: exerciseCatalogRepo.ExerciseSessionPerformance[];
  userVideoId: string | null;
  curatedVideoId: string | null;
  videoDemoted: boolean;
  pinnedNote: string | null;
  disabled: boolean;
}

export default function ExerciseDetailScreen({ route, navigation }: Props): React.JSX.Element {
  const { db, library, families } = useStore();
  const theme = useTheme();
  const styles = useStyles();
  const insets = useInsets();
  const { exerciseId } = route.params;
  const exercise = useMemo(
    () => library.exercises.find((e) => e.id === exerciseId) ?? null,
    [library, exerciseId],
  );
  const [data, setData] = useState<DetailData | null>(null);
  const [chartMode, setChartMode] = useState<'best' | 'volume'>('best');

  const load = useCallback(() => {
    setData({
      catalog:
        exerciseCatalogRepo.getExerciseCatalogState(db)[exerciseId] ??
        exerciseCatalogRepo.emptyCatalogState(),
      history: exerciseCatalogRepo.getExercisePerformanceHistory(db, exerciseId),
      userVideoId: exerciseStateRepo.getUserVideoId(db, exerciseId),
      curatedVideoId: remoteConfigRepo.getCuratedVideoId(db, exerciseId),
      videoDemoted: exerciseStateRepo.getVideoFlagState(db, exerciseId).demoted,
      pinnedNote: exerciseStateRepo.getExerciseState(db, exerciseId)?.pinnedNote ?? null,
      disabled: exerciseStateRepo.getExerciseState(db, exerciseId)?.disabledAt != null,
    });
  }, [db, exerciseId]);

  useFocusEffect(useCallback(() => load(), [load]));

  // The same store calls the workout screen makes — see this file's header for why that matters.
  const handleAssignVideo = (videoId: string) => {
    exerciseStateRepo.assignUserVideo(
      db,
      exerciseId,
      videoId,
      nowUtcInstant(),
      localDateFromDate(new Date()),
    );
    load();
  };
  const handleClearVideo = () => {
    exerciseStateRepo.clearUserVideo(db, exerciseId, nowUtcInstant());
    load();
  };
  const handleReportVideoIssue = () => {
    exerciseStateRepo.reportVideoIssue(
      db,
      exerciseId,
      'user_report',
      nowUtcInstant(),
      localDateFromDate(new Date()),
    );
    load();
  };
  const handlePlayerError = () => {
    exerciseStateRepo.reportVideoIssue(
      db,
      exerciseId,
      'player_error',
      nowUtcInstant(),
      localDateFromDate(new Date()),
    );
    load();
  };
  const handlePinnedNoteChange = (note: string) => {
    exerciseStateRepo.setPinnedNote(
      db,
      exerciseId,
      note.length > 0 ? note : null,
      nowUtcInstant(),
      localDateFromDate(new Date()),
    );
    load();
  };
  const handleToggleDisabled = () => {
    exerciseStateRepo.setDisabled(db, exerciseId, !(data?.disabled ?? false), nowUtcInstant());
    load();
  };

  if (!exercise) {
    return (
      <Screen edges={['top', 'left', 'right']} contentStyle={styles.missing}>
        <EmptyState
          testID="exercise-missing"
          icon="search"
          tone="gold"
          title="That exercise isn’t in the library any more."
          body="The Field Guide has plenty more to explore."
          actionLabel="Back to the guide"
          onAction={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  const progress = buildExerciseProgress(data?.history ?? [], exercise.metric);
  const chart = chartMode === 'volume' ? progress.volumeChart : progress.chart;
  const tone = FOCUS_TONE[exercise.focus[0] ?? 'full'];
  const ink = theme.onGradient(tone);
  const timesCompleted = data?.catalog.timesCompleted ?? 0;
  const lastPerformedAt = data?.catalog.lastPerformedAt ?? null;
  const enabled = !(data?.disabled ?? false);

  return (
    <Screen scroll padded={false} adjustForKeyboard testID="exercise-detail-screen">
      <View style={[styles.hero, { paddingTop: insets.top + space.md }]}>
        <Gradient colors={heroGradient(theme, tone)} angle={150} />
        <TopoPattern seed={exercise.id} strength={1.6} />
        <View style={styles.heroBar}>
          <IconButton
            testID="detail-back"
            icon="back"
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
          />
        </View>
        <View style={styles.heroText}>
          <Txt
            testID="detail-name"
            variant="display"
            color={ink}
            numberOfLines={3}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {exercise.name}
          </Txt>
          <Txt variant="bodyStrong" color={ink}>
            {primaryMuscleLabel(exercise)} · {formatToken(exercise.pattern)}
          </Txt>
          {exercise.aliases.length > 0 && (
            <Txt variant="small" color={ink} style={styles.aliases}>
              Also called {exercise.aliases.join(', ')}
            </Txt>
          )}
        </View>
      </View>

      <View style={styles.body}>
        <Enter index={0} style={styles.statRow}>
          <StatTile
            testID="detail-times-completed"
            style={styles.stat}
            value={timesCompleted}
            label={timesCompleted === 1 ? 'session completed' : 'sessions completed'}
            icon="flame"
            tone="pine"
          />
          <StatTile
            testID="detail-last-performed"
            style={styles.stat}
            value={lastPerformedAt ? formatLocalDate(lastPerformedAt) : 'Not yet'}
            label="last performed"
            icon="time"
            tone="gold"
          />
        </Enter>

        {/* The note the user wrote for themselves about this movement — the same one the workout
            screen shows above the exercise, on the same per-exercise row. */}
        <Enter index={1}>
          <PinnedNote note={data?.pinnedNote ?? null} onChange={handlePinnedNoteChange} />
        </Enter>

        <Enter index={2}>
          <Card padding="md" style={styles.card}>
            <CardHeader icon="guide" tone="gold" title="How to" />
            <Txt testID="detail-setup" variant="body" color="text2">
              {exercise.setup}
            </Txt>
          </Card>
        </Enter>

        {/* DemoMedia is its own card with its own "Demo" header row. */}
        <Enter index={3}>
          <DemoMedia
            videoSearchQuery={exercise.video_search}
            userVideoId={data?.userVideoId ?? null}
            curatedVideoId={data?.curatedVideoId ?? null}
            videoDemoted={data?.videoDemoted ?? false}
            onAssignVideo={handleAssignVideo}
            onClearVideo={handleClearVideo}
            // The §8.3 "demo expanded" signal is a fact about an entry in a session; browsing the
            // library is not a session, and there is no entry to attach it to. Nothing to record.
            onExpand={() => {}}
            onReportIssue={handleReportVideoIssue}
            onPlayerError={handlePlayerError}
            defaultOpen
          />
        </Enter>

        <Enter index={4}>
          {chart.length === 0 ? (
            <EmptyState
              icon="trendingUp"
              tone="summit"
              title="Your progress starts here"
              body={progressSummary(progress)}
              bodyTestID="detail-progress-summary"
            />
          ) : (
            <Card padding="md" style={styles.card}>
              <CardHeader icon="trendingUp" tone="summit" title="Progress" />
              <Txt testID="detail-progress-summary" variant="bodyStrong">
                {progressSummary(progress)}
              </Txt>

              <View testID="detail-chart" style={styles.chart}>
                <View style={styles.gains}>
                  <Chip
                    testID="detail-chart-best"
                    label="Best set"
                    size="sm"
                    tone="summit"
                    selected={chartMode === 'best'}
                    onPress={() => setChartMode('best')}
                  />
                  <Chip
                    testID="detail-chart-volume"
                    label="Total volume"
                    size="sm"
                    tone="summit"
                    selected={chartMode === 'volume'}
                    onPress={() => setChartMode('volume')}
                  />
                </View>
                <ProgressChart
                  testID="detail-progress-chart"
                  title={chartMode === 'volume' ? 'Total volume' : 'Best set'}
                  points={chart}
                  formatValue={(v) => unitLabel(progress.unit, v)}
                  integerTicks
                  zeroBase={chartMode === 'volume'}
                />
              </View>

              <View style={styles.gains}>
                {gainLines(progress).map((line) => (
                  <Chip
                    key={line.label}
                    testID={`detail-gain-${line.label}`}
                    label={`${line.label} · ${line.detail}`}
                    tone={line.improved ? 'pine' : 'neutral'}
                    icon={line.improved ? 'trendingUp' : undefined}
                    wrap
                  />
                ))}
              </View>
            </Card>
          )}
        </Enter>

        <Enter index={5}>
          <Card padding="md" style={styles.card}>
            <CardHeader icon="info" tone="sky" title="Details" />
            <View style={styles.grid}>
              <Spec label="Focus" value={exercise.focus.map(formatToken).join(', ')} />
              <Spec label="Movement pattern" value={formatToken(exercise.pattern)} />
              <Spec label="Primary muscles" value={exercise.primary.map(formatToken).join(', ')} />
              <Spec
                label="Secondary muscles"
                value={exercise.secondary.map(formatToken).join(', ') || 'None'}
              />
              <Spec label="Equipment" value={formatToken(exercise.equipment)} />
              <Spec label="Band range" value={exercise.band ?? 'Bodyweight'} />
              <Spec
                label="Anchor"
                value={
                  exercise.anchor_alt
                    ? `${formatToken(exercise.anchor)} or ${formatToken(exercise.anchor_alt)}`
                    : formatToken(exercise.anchor)
                }
              />
              <Spec label="Anchor class" value={formatToken(exercise.anchor_class)} />
              <Spec
                label="Sides"
                value={exercise.unilateral ? 'One side at a time' : 'Both sides'}
              />
              <Spec label="Metric" value={formatToken(exercise.metric)} />
              {exercise.default_seconds != null && (
                <Spec label="Default hold" value={`${exercise.default_seconds}s`} />
              )}
              <Spec label="Difficulty" value={formatToken(exercise.difficulty)} />
              <Spec label="Tier" value={formatToken(exercise.tier)} />
              <Spec label="Sections" value={exercise.roles.map(formatToken).join(', ')} />
              <Spec label="Progression" value={progressionLabel(exercise, families)} wide />
              <Spec
                label="Contraindications"
                value={exercise.contraindications.map(formatToken).join(', ') || 'None'}
                wide
              />
            </View>
            <Txt testID="detail-field-Library id" variant="caption" color="text3">
              Library id · {exercise.id}
            </Txt>
          </Card>
        </Enter>

        {/* Permanent, explicit user veto — never appears in any generated workout while off.
            Distinct from the system's own temporary suppression, which has no UI of its own.
            It is the one control here that removes an exercise from every future workout, so it
            gets a full-width card of its own at the very bottom rather than blending into the
            details above — but no red: turning a move off is the user's call, not an error. */}
        <Enter index={6}>
          <PressableScale
            testID="toggle-exercise-disabled"
            accessibilityRole="switch"
            accessibilityLabel={
              enabled
                ? 'Disable this exercise — it will never be suggested again'
                : 'Enable this exercise — it will appear in workouts again'
            }
            accessibilityState={{ checked: enabled }}
            onPress={handleToggleDisabled}
            style={styles.toggleCard}
          >
            <IconBadge icon="barbell" tone={enabled ? 'pine' : 'gold'} size={40} />
            <View style={styles.toggleLabels}>
              <Txt variant="h3">Use in workouts</Txt>
              <Txt variant="caption" color="text2">
                {enabled ? 'Currently appears in workouts' : 'Currently hidden from workouts'}
              </Txt>
            </View>
            <Switch
              testID="toggle-exercise-disabled-switch"
              value={enabled}
              onValueChange={handleToggleDisabled}
              accessibilityLabel="Use in workouts"
            />
          </PressableScale>
        </Enter>
      </View>
    </Screen>
  );
}

/** "Vertical Pull · level 5 of 9", or the honest "Not on a ladder" for the accessory movements
 *  (warmups, stretches, finishers) that carry no `progression_family`. Reads the ordinal from the
 *  engine rather than counting positions here — `level_id` is a stable identifier and never an
 *  array index (invariant 5). */
function progressionLabel(
  exercise: Exercise,
  families: ReturnType<typeof useStore>['families'],
): string {
  if (!exercise.progression_family || !exercise.progression_level_id) return 'Not on a ladder';
  const family = families.families.find((f) => f.id === exercise.progression_family);
  if (!family) return formatToken(exercise.progression_family);
  const ordinal = levelOrdinal(family, exercise.progression_level_id);
  return `${family.name} · level ${ordinal.n} of ${ordinal.of}`;
}

/** Section-card header: an accent icon and an eyebrow label (matches `DemoMedia`'s own header). */
function CardHeader({
  icon,
  tone,
  title,
}: {
  icon: IconName;
  tone: AccentName;
  title: string;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.cardHeader}>
      <Icon name={icon} size={16} color={tone} style={styles.cardHeaderIcon} />
      <Txt variant="eyebrow" color="text2" accessibilityRole="header">
        {title}
      </Txt>
    </View>
  );
}

/** One tile of the Details grid: eyebrow label over a `bodyStrong` value. `wide` spans both columns
 *  (long values: muscle lists, the ladder rung, contraindications). */
function Spec({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={[styles.spec, wide && styles.specWide]} testID={`detail-field-${label}`}>
      <Txt variant="eyebrow" color="text3">
        {label}
      </Txt>
      <Txt variant="bodyStrong">{value}</Txt>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    missing: { paddingTop: space.huge, justifyContent: 'center' },
    hero: {
      overflow: 'hidden',
      paddingHorizontal: gutter,
      paddingBottom: space.xxl,
      borderBottomLeftRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
    },
    heroBar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.xl },
    heroText: { gap: space.xs },
    aliases: { opacity: 0.8 },
    body: { paddingHorizontal: gutter, paddingTop: space.xl, gap: space.lg },
    statRow: { flexDirection: 'row', gap: space.md },
    stat: { flex: 1, minWidth: 0 },
    card: { gap: space.md },
    cardHeader: { flexDirection: 'row', alignItems: 'center' },
    cardHeaderIcon: { marginRight: space.sm - 2 },
    chart: { gap: space.sm },
    gains: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    spec: {
      flexGrow: 1,
      flexBasis: '47%',
      minWidth: 0,
      gap: 2,
      padding: space.md,
      borderRadius: radius.md,
      backgroundColor: t.colors.surface2,
    },
    specWide: { flexBasis: '100%' },
    toggleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      padding: space.lg,
      borderRadius: radius.lg,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.line,
      ...t.elevation.card,
    },
    toggleLabels: { flex: 1, gap: 2 },
  }),
);
