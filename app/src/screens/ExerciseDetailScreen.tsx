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
 * that whatever turns out to be noise gets trimmed later — so the "Details" table below is
 * deliberately exhaustive rather than curated.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { exerciseCatalogRepo, exerciseStateRepo, remoteConfigRepo } from '@roamfit/store';
import { levelOrdinal } from '@roamfit/engine';
import type { Exercise } from '@roamfit/data';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { localDateFromDate, nowUtcInstant } from '../lib/localClock';
import DemoMedia from '../components/DemoMedia';
import PinnedNote from '../components/PinnedNote';
import { formatToken, primaryMuscleLabel } from '../lib/exerciseCatalog';
import {
  buildExerciseProgress,
  formatLocalDate,
  gainLines,
  progressSummary,
  unitLabel,
} from '../lib/exerciseProgress';
import type { ChartPoint } from '../lib/exerciseProgress';

type Props = NativeStackScreenProps<RootStackParamList, 'ExerciseDetail'>;

/** A long history would otherwise squeeze the bars into invisibility. The most recent dozen is
 *  enough to see a trend on a phone; the gain rows below are computed over *all* of it, so nothing
 *  earned is dropped just because it scrolled off the chart. */
const CHART_WINDOW = 12;

interface DetailData {
  catalog: exerciseCatalogRepo.ExerciseCatalogState;
  history: exerciseCatalogRepo.ExerciseSessionPerformance[];
  userVideoId: string | null;
  curatedVideoId: string | null;
  videoDemoted: boolean;
  pinnedNote: string | null;
}

export default function ExerciseDetailScreen({ route, navigation }: Props): React.JSX.Element {
  const { db, library, families } = useStore();
  const { exerciseId } = route.params;
  const exercise = useMemo(
    () => library.exercises.find((e) => e.id === exerciseId) ?? null,
    [library, exerciseId],
  );
  const [data, setData] = useState<DetailData | null>(null);

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
    });
  }, [db, exerciseId]);

  useFocusEffect(useCallback(() => load(), [load]));

  React.useEffect(() => {
    if (exercise) navigation.setOptions({ title: exercise.name });
  }, [exercise, navigation]);

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

  if (!exercise) {
    return (
      <View style={styles.centered}>
        <Text testID="exercise-missing" style={styles.body}>
          That exercise isn’t in the library any more.
        </Text>
      </View>
    );
  }

  const progress = buildExerciseProgress(data?.history ?? [], exercise.metric);
  const chart = progress.chart.slice(-CHART_WINDOW);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <View>
        <Text testID="detail-name" style={styles.name}>
          {exercise.name}
        </Text>
        <Text style={styles.subtitle}>
          {primaryMuscleLabel(exercise)} · {formatToken(exercise.pattern)}
        </Text>
        {exercise.aliases.length > 0 && (
          <Text style={styles.aliases}>Also called {exercise.aliases.join(', ')}</Text>
        )}
      </View>

      <View style={styles.statRow}>
        <Stat
          testID="detail-times-completed"
          value={String(data?.catalog.timesCompleted ?? 0)}
          label={
            (data?.catalog.timesCompleted ?? 0) === 1 ? 'session completed' : 'sessions completed'
          }
        />
        {data?.catalog.lastPerformedAt && (
          <Stat
            testID="detail-last-performed"
            value={formatLocalDate(data.catalog.lastPerformedAt)}
            label="last performed"
          />
        )}
      </View>

      {/* The note the user wrote for themselves about this movement — the same one the workout
          screen shows above the exercise, on the same per-exercise row. */}
      <PinnedNote note={data?.pinnedNote ?? null} onChange={handlePinnedNoteChange} />

      <Section label="How to">
        <Text testID="detail-setup" style={styles.body}>
          {exercise.setup}
        </Text>
      </Section>

      <Section label="Demo">
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
      </Section>

      <Section label="Progress">
        <Text testID="detail-progress-summary" style={styles.body}>
          {progressSummary(progress)}
        </Text>

        {chart.length > 0 && (
          <View testID="detail-chart" style={styles.chart}>
            <Text style={styles.chartCaption}>
              Best set per session
              {progress.chart.length > chart.length ? ` · last ${CHART_WINDOW}` : ''}
            </Text>
            <Chart points={chart} unit={progress.unit} />
          </View>
        )}

        {gainLines(progress).map((line) => (
          <View key={line.label} style={styles.gainRow} testID={`detail-gain-${line.label}`}>
            <Text style={styles.gainLabel}>{line.label}</Text>
            <Text style={[styles.gainDetail, line.improved && styles.gainDetailUp]}>
              {line.improved ? '▲ ' : ''}
              {line.detail}
            </Text>
          </View>
        ))}
      </Section>

      <Section label="Details">
        <Detail label="Focus" value={exercise.focus.map(formatToken).join(', ')} />
        <Detail label="Movement pattern" value={formatToken(exercise.pattern)} />
        <Detail label="Primary muscles" value={exercise.primary.map(formatToken).join(', ')} />
        <Detail
          label="Secondary muscles"
          value={exercise.secondary.map(formatToken).join(', ') || 'None'}
        />
        <Detail label="Equipment" value={formatToken(exercise.equipment)} />
        <Detail label="Band range" value={exercise.band ?? 'Bodyweight'} />
        <Detail label="Anchor" value={formatToken(exercise.anchor)} />
        <Detail label="Anchor class" value={formatToken(exercise.anchor_class)} />
        <Detail label="Sides" value={exercise.unilateral ? 'One side at a time' : 'Both sides'} />
        <Detail label="Metric" value={formatToken(exercise.metric)} />
        {exercise.default_seconds != null && (
          <Detail label="Default hold" value={`${exercise.default_seconds}s`} />
        )}
        <Detail label="Difficulty" value={formatToken(exercise.difficulty)} />
        <Detail label="Tier" value={formatToken(exercise.tier)} />
        <Detail label="Sections" value={exercise.roles.map(formatToken).join(', ')} />
        <Detail label="Progression" value={progressionLabel(exercise, families)} />
        <Detail
          label="Contraindications"
          value={exercise.contraindications.map(formatToken).join(', ') || 'None'}
        />
        <Detail label="Library id" value={exercise.id} />
      </Section>
    </ScrollView>
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

/**
 * A horizontal bar per session, oldest at the top. Deliberately not a line chart: this needs no
 * measured layout, no SVG and no charting dependency, it reads at a glance on a phone, and every
 * bar carries its own date and value so the picture is never the only way to get the number.
 */
function Chart({
  points,
  unit,
}: {
  points: ChartPoint[];
  unit: 'reps' | 'seconds';
}): React.JSX.Element {
  const max = Math.max(...points.map((p) => p.value), 1);
  return (
    <View style={styles.chartBody}>
      {points.map((point, i) => (
        <View key={`${point.localDate}-${i}`} style={styles.chartRow}>
          <Text style={styles.chartDate}>{formatLocalDate(point.localDate)}</Text>
          <View style={styles.chartTrack}>
            <View style={[styles.chartFill, { width: `${(point.value / max) * 100}%` }]} />
          </View>
          <Text style={styles.chartValue}>{unitLabel(unit, point.value)}</Text>
        </View>
      ))}
    </View>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Stat({
  testID,
  value,
  label,
}: {
  testID: string;
  value: string;
  label: string;
}): React.JSX.Element {
  return (
    <View style={styles.stat} testID={testID}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.detailRow} testID={`detail-field-${label}`}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  container: { padding: 20, gap: 20, paddingBottom: 64 },
  name: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#475569', marginTop: 2 },
  aliases: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  statRow: { flexDirection: 'row', gap: 24 },
  stat: { gap: 2 },
  statValue: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  statLabel: { fontSize: 11, color: '#64748b' },
  section: { gap: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  body: { fontSize: 14, lineHeight: 20, color: '#334155' },
  chart: { gap: 6 },
  chartCaption: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  chartBody: { gap: 6 },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chartDate: { width: 52, fontSize: 11, color: '#64748b' },
  chartTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: '#e2e8f0' },
  chartFill: { height: 12, borderRadius: 6, backgroundColor: '#1d4ed8' },
  chartValue: { width: 64, fontSize: 11, color: '#334155', textAlign: 'right', fontWeight: '600' },
  gainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  gainLabel: { fontSize: 13, color: '#475569' },
  gainDetail: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  gainDetailUp: { color: '#15803d' },
  detailRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  detailLabel: { width: 132, fontSize: 12, color: '#64748b' },
  detailValue: { flex: 1, fontSize: 12, color: '#0f172a', fontWeight: '600' },
});
