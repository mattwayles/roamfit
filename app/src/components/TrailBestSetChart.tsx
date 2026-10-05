/**
 * The best-set-per-session chart for one Trail, drawn inside its card on Journey. One line across
 * every rung, coloured per exercise, with a dashed tick wherever the ladder moved to a new rung
 * (`lib/trailProgress.ts` builds all of it). It replaced the separate Trail progress page: the
 * one graph that page was for now sits on the ladder it describes.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { makeStyles, space, useTheme } from '../theme';
import { Chip, Txt } from '../ui';
import { ProgressChart, SEGMENT_TONES } from './ProgressChart';
import { unitLabel } from '../lib/exerciseProgress';
import type { TrailProgress } from '../lib/trailProgress';

export interface TrailBestSetChartProps {
  familyId: string;
  progress: TrailProgress;
}

export function TrailBestSetChart({
  familyId,
  progress,
}: TrailBestSetChartProps): React.JSX.Element | null {
  const theme = useTheme();
  const styles = useStyles();
  // Nothing measured on this trail yet: the card already says where you stand, so no empty chart.
  if (progress.points.length === 0) return null;
  const unit = progress.unit;
  const formatBest = (v: number) => (unit ? unitLabel(unit, v) : String(v));
  const toneOf = (segment: number) => SEGMENT_TONES[segment % SEGMENT_TONES.length];

  return (
    <View style={styles.wrap} testID={`board-best-${familyId}`}>
      <Txt variant="eyebrow" color="text3">
        Best set per session
      </Txt>
      <ProgressChart
        testID={`board-best-chart-${familyId}`}
        title="Best set"
        points={progress.points}
        markers={progress.markers}
        formatValue={formatBest}
        integerTicks
        height={140}
        describePoint={(i) => progress.pointExercise[i] ?? null}
      />
      {progress.markers.length > 0 ? (
        <Txt variant="caption" color="text3">
          Dashed ticks mark a move to a new rung.
        </Txt>
      ) : null}
      {progress.exercises.length > 1 ? (
        <View style={styles.legend} testID={`board-best-legend-${familyId}`}>
          {progress.exercises.map((ex) => (
            <Chip
              key={ex.exerciseId}
              label={ex.name}
              size="sm"
              tone={toneOf(ex.segment)}
              leading={
                <View style={[styles.dot, { backgroundColor: theme.colors[toneOf(ex.segment)] }]} />
              }
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    wrap: { gap: space.sm },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    dot: { width: 8, height: 8, borderRadius: 4 },
  }),
);
