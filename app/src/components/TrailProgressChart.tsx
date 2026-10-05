/**
 * The chart drawn inside each Trail card on Journey (`lib/trailProgress.ts` builds all of it), with
 * a small Progress / Best set toggle. It replaced the separate Trail progress page: the graph now
 * sits on the ladder it describes.
 *
 * - **Progress** (default): each session's position on the engine's micro ladder, so moving to a
 *   heavier band and doing fewer reps reads as a step forward, which is what it is. One colour, one
 *   line; rung ticks ("L3") mark a move to a new rung.
 * - **Best set**: reps or seconds per session. The line breaks and changes colour wherever the band
 *   (or exercise) changes, with a dashed tick labelled with the band ("B3") beside the rung ticks,
 *   and the tap readout says "8 reps @ B3".
 *
 * Progress is hidden when no session could be placed on the ladder, and the card falls back to Best
 * set. Nothing here is styled as a decline (invariant 4).
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { makeStyles, space, useTheme } from '../theme';
import { Chip, Txt } from '../ui';
import { ProgressChart, SEGMENT_TONES } from './ProgressChart';
import { unitLabel } from '../lib/exerciseProgress';
import { bestSetLabel, steps } from '../lib/ladderSeries';
import type { TrailProgress } from '../lib/trailProgress';

export interface TrailProgressChartProps {
  familyId: string;
  progress: TrailProgress;
}

type Mode = 'progress' | 'best';

export function TrailProgressChart({
  familyId,
  progress,
}: TrailProgressChartProps): React.JSX.Element | null {
  const theme = useTheme();
  const styles = useStyles();
  const [picked, setPicked] = useState<Mode>('progress');
  const hasProgress = progress.ladder.points.length > 0;
  const hasBest = progress.points.length > 0;
  // Nothing measured on this trail yet: the card already says where you stand, so no empty chart.
  if (!hasProgress && !hasBest) return null;
  const mode: Mode = hasProgress && (picked === 'progress' || !hasBest) ? 'progress' : 'best';

  const unit = progress.unit;
  const toneOf = (segment: number) => SEGMENT_TONES[segment % SEGMENT_TONES.length];

  return (
    <View style={styles.wrap} testID={`board-chart-${familyId}`}>
      <View style={styles.head}>
        <Txt variant="eyebrow" color="text3">
          {mode === 'progress' ? 'Progress per session' : 'Best set per session'}
        </Txt>
        {hasProgress && hasBest ? (
          <View style={styles.toggle}>
            <Chip
              testID={`board-chart-mode-progress-${familyId}`}
              label="Progress"
              size="sm"
              tone="sky"
              selected={mode === 'progress'}
              onPress={() => setPicked('progress')}
            />
            <Chip
              testID={`board-chart-mode-best-${familyId}`}
              label="Best set"
              size="sm"
              tone="sky"
              selected={mode === 'best'}
              onPress={() => setPicked('best')}
            />
          </View>
        ) : null}
      </View>

      {mode === 'progress' ? (
        <>
          <ProgressChart
            testID={`board-chart-plot-${familyId}`}
            title="Progress"
            points={progress.ladder.points}
            markers={progress.ladder.markers}
            formatValue={steps}
            integerTicks
            height={140}
            describeValue={(i) => progress.ladder.labels[i] ?? null}
            describePoint={(i) => progress.ladder.pointExercise[i] ?? null}
          />
          <Txt variant="caption" color="text3">
            Steps up the ladder: a heavier band counts as a step forward, even with fewer reps.
            {progress.ladder.markers.length > 0 ? ' Dashed ticks mark a move to a new rung.' : ''}
          </Txt>
        </>
      ) : (
        <>
          <ProgressChart
            testID={`board-chart-plot-${familyId}`}
            title="Best set"
            points={progress.points}
            markers={progress.markers}
            formatValue={(v) => (unit ? unitLabel(unit, v) : String(v))}
            integerTicks
            height={140}
            describeValue={(i) =>
              unit && progress.points[i]
                ? bestSetLabel(unit, progress.points[i].value, progress.pointBand[i] ?? null)
                : null
            }
            describePoint={(i) => progress.pointExercise[i] ?? null}
          />
          {progress.markers.length > 0 ? (
            <Txt variant="caption" color="text3">
              Dashed ticks mark a move to a new rung or band.
            </Txt>
          ) : null}
          {progress.legend.length > 1 ? (
            <View style={styles.legend} testID={`board-best-legend-${familyId}`}>
              {progress.legend.map((entry) => (
                <Chip
                  key={entry.segment}
                  label={entry.label}
                  size="sm"
                  tone={toneOf(entry.segment)}
                  leading={
                    <View
                      style={[styles.dot, { backgroundColor: theme.colors[toneOf(entry.segment)] }]}
                    />
                  }
                />
              ))}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    wrap: { gap: space.sm },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space.sm,
    },
    toggle: { flexDirection: 'row', gap: space.sm },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    dot: { width: 8, height: 8, borderRadius: 4 },
  }),
);
