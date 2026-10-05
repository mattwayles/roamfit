/**
 * One movement group over time: where you are on the ladder now, a best-set chart across every
 * rung (coloured per exercise, with a tick where the rung changed), the rung as a step line, and
 * the exercises you have done on it. Read-only; every number comes from `set_logs` through
 * `getFamilyPerformanceHistory`, and nothing here re-derives a level (the engine owns those).
 *
 * Never punish (invariant 4): the headline compares best to first, the chart is one neutral-to-
 * accent line with no red and no "drop" styling, and a unit change leaves a gap rather than a zero.
 */
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { exerciseCatalogRepo, progressionStateRepo } from '@roamfit/store';
import type { RootStackParamList } from '../navigation/types';
import { useStore } from '../state/StoreContext';
import { EmptyState } from '../components/EmptyState';
import { ProgressChart, SEGMENT_TONES } from '../components/ProgressChart';
import { buildProgressionBoard } from '../lib/dashboard';
import { unitLabel } from '../lib/exerciseProgress';
import { buildTrailProgress } from '../lib/trailProgress';
import { makeStyles, space, useTheme } from '../theme';
import { Card, Chip, Enter, Icon, PressableScale, Screen, SectionHeader, Txt } from '../ui';

type Props = NativeStackScreenProps<RootStackParamList, 'TrailProgress'>;

export default function TrailProgressScreen({ route, navigation }: Props): React.JSX.Element {
  const { db, library, families } = useStore();
  const theme = useTheme();
  const styles = useStyles();
  const { familyId } = route.params;

  const family = useMemo(
    () => families.families.find((f) => f.id === familyId) ?? null,
    [families, familyId],
  );

  const view = useMemo(() => {
    if (!family) return null;
    const history = exerciseCatalogRepo.getFamilyPerformanceHistory(db, family.id);
    const progress = buildTrailProgress(family, library.exercises, history);
    const states = progressionStateRepo.getAllProgressionStates(db);
    const now = buildProgressionBoard(library, families, states).find(
      (b) => b.familyId === family.id,
    );
    return { progress, now };
  }, [db, family, library, families]);

  if (!family || !view) {
    return (
      <Screen scroll contentStyle={styles.missing} testID="trail-progress-missing">
        <EmptyState
          icon="search"
          tone="gold"
          title="That trail isn’t in the library any more."
          body="The Journey tab lists every trail you can climb."
          actionLabel="Back"
          onAction={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  const { progress, now } = view;
  const unit = progress.unit;
  const formatBest = (v: number) => (unit ? unitLabel(unit, v) : String(v));

  return (
    <Screen scroll testID="trail-progress-screen" contentStyle={styles.content}>
      <Enter index={0}>
        <Card padding="lg" style={styles.hero} testID="trail-hero">
          <Txt testID="trail-name" variant="h1">
            {family.name}
          </Txt>
          {now ? (
            <Txt testID="trail-current" variant="bodyStrong">
              Now: rung {now.ordinal.n} of {now.ordinal.of} · {now.exerciseName}
            </Txt>
          ) : null}
          <Txt testID="trail-headline" variant="body" color="text2">
            {progress.headline}
          </Txt>
        </Card>
      </Enter>

      {progress.sessions === 0 ? (
        <Enter index={1}>
          <EmptyState
            icon="trendingUp"
            tone="summit"
            title="Your progress starts here"
            body="Finish a workout with this trail in it and the chart fills in."
          />
        </Enter>
      ) : (
        <>
          {progress.points.length > 0 ? (
            <Enter index={1}>
              <Card padding="md" style={styles.card} testID="trail-best-card">
                <SectionHeader title="Best set per session" />
                <ProgressChart
                  testID="trail-best-chart"
                  title="Best set"
                  points={progress.points}
                  markers={progress.markers}
                  formatValue={formatBest}
                  integerTicks
                  describePoint={(i) => progress.pointExercise[i] ?? null}
                />
                {progress.markers.length > 0 ? (
                  <Txt variant="caption" color="text3">
                    Dashed ticks mark a move to a new rung.
                  </Txt>
                ) : null}
                {progress.exercises.length > 1 ? (
                  <View style={styles.legend} testID="trail-legend">
                    {progress.exercises.map((ex) => (
                      <Chip
                        key={ex.exerciseId}
                        label={ex.name}
                        size="sm"
                        tone={SEGMENT_TONES[ex.segment % SEGMENT_TONES.length]}
                        leading={
                          <View
                            style={[
                              styles.dot,
                              {
                                backgroundColor:
                                  theme.colors[SEGMENT_TONES[ex.segment % SEGMENT_TONES.length]],
                              },
                            ]}
                          />
                        }
                      />
                    ))}
                  </View>
                ) : null}
              </Card>
            </Enter>
          ) : null}

          {progress.rungPoints.length > 0 ? (
            <Enter index={2}>
              <Card padding="md" style={styles.card} testID="trail-rung-card">
                <SectionHeader title="Rung over time" />
                <ProgressChart
                  testID="trail-rung-chart"
                  title="Rung"
                  points={progress.rungPoints}
                  formatValue={(v) => `Rung ${v}`}
                  step
                  integerTicks
                  height={140}
                />
              </Card>
            </Enter>
          ) : null}

          <Enter index={3} style={styles.section}>
            <SectionHeader title="Exercises on this trail" />
            <Card padding="none" style={styles.rows}>
              {progress.exercises.map((ex, i) => (
                <PressableScale
                  key={ex.exerciseId}
                  testID={`trail-exercise-${ex.exerciseId}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${ex.name}. ${ex.sessions} ${ex.sessions === 1 ? 'session' : 'sessions'}. ${ex.summary}. Open exercise`}
                  onPress={() =>
                    navigation.navigate('ExerciseDetail', { exerciseId: ex.exerciseId })
                  }
                  style={[styles.row, i > 0 && styles.rowDivider]}
                >
                  <View style={styles.rowText}>
                    <Txt variant="bodyStrong">{ex.name}</Txt>
                    <Txt variant="caption" color="text2">
                      {ex.sessions} {ex.sessions === 1 ? 'session' : 'sessions'} · {ex.summary}
                    </Txt>
                  </View>
                  <Icon name="chevronRight" size={18} color="text3" />
                </PressableScale>
              ))}
            </Card>
          </Enter>
        </>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    missing: { paddingTop: space.huge, justifyContent: 'center' },
    content: { gap: space.lg, paddingTop: space.md, paddingBottom: space.huge },
    hero: { gap: space.xs },
    card: { gap: space.md },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    dot: { width: 8, height: 8, borderRadius: 4 },
    section: { gap: space.sm },
    rows: { overflow: 'hidden' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingHorizontal: space.md,
      paddingVertical: space.md,
    },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.line },
    rowText: { flex: 1, minWidth: 0, gap: 2 },
  }),
);
