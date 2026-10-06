/**
 * The chart drawn inside each Trail card on Journey (`lib/trailProgress.ts` builds all of it): one
 * graph per level, with ‹ › arrows to page between the levels the user has trained and a small
 * Progress / Best set toggle.
 *
 * - **One level per graph.** A move up a rung is a harder exercise, so the best set falls even
 *   though the user progressed; on one shared line that read as a regression. Each level is its own
 *   page, titled "Level 2 · Pull-up" with its session count and dates, and the card opens on the level
 *   of the latest session. Earlier levels are a tap back — progress over time, level by level.
 * - **Progress** (default): steps up this level, so moving to a heavier band and doing fewer reps
 *   reads as a step forward, which is what it is.
 * - **Best set**: reps or seconds per session at this level. The line breaks and changes colour
 *   wherever the band (or sibling exercise) changes, with a dashed tick labelled with the band
 *   ("B3"), and the tap readout says "8 reps @ B3".
 *
 * Progress is hidden on a page where no session could be placed on the ladder, and that page falls
 * back to Best set. Nothing here is styled as a decline (invariant 4).
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { makeStyles, space, useTheme } from '../theme';
import { Chip, IconButton, Txt } from '../ui';
import { ProgressChart, SEGMENT_TONES } from './ProgressChart';
import { formatLocalDate, unitLabel } from '../lib/exerciseProgress';
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
  // null = the level of the latest session; clamped in case a reload dropped a page.
  const [pickedPage, setPickedPage] = useState<number | null>(null);
  const pages = progress.levels;
  const charted = pages.some((p) => p.ladder.points.length > 0 || p.best.points.length > 0);
  // Nothing measured on this trail yet: the card already says where you stand, so no empty chart.
  if (!charted) return null;

  const index = Math.min(Math.max(pickedPage ?? progress.currentLevel, 0), pages.length - 1);
  const page = pages[index];
  const hasProgress = page.ladder.points.length > 0;
  const hasBest = page.best.points.length > 0;
  const mode: Mode = hasProgress && (picked === 'progress' || !hasBest) ? 'progress' : 'best';
  const unit = page.unit;
  const best = page.best;
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

      <View style={styles.pager}>
        {pages.length > 1 ? (
          <IconButton
            testID={`board-level-prev-${familyId}`}
            icon="back"
            size="sm"
            variant="plain"
            tone={index > 0 ? 'text' : 'text3'}
            disabled={index === 0}
            accessibilityLabel="Previous level"
            onPress={() => setPickedPage(index - 1)}
          />
        ) : null}
        <View style={styles.pageTitle} testID={`board-level-title-${familyId}`}>
          <Txt variant="h3" align="center" numberOfLines={1}>
            {`Level ${page.n} · ${page.name}`}
          </Txt>
          <Txt variant="caption" color="text3" align="center">
            {`${page.sessions} ${page.sessions === 1 ? 'session' : 'sessions'} · ${formatLocalDate(page.firstDate)}${page.latestDate !== page.firstDate ? ` – ${formatLocalDate(page.latestDate)}` : ''}`}
          </Txt>
        </View>
        {pages.length > 1 ? (
          <IconButton
            testID={`board-level-next-${familyId}`}
            icon="chevronRight"
            size="sm"
            variant="plain"
            tone={index < pages.length - 1 ? 'text' : 'text3'}
            disabled={index === pages.length - 1}
            accessibilityLabel="Next level"
            onPress={() => setPickedPage(index + 1)}
          />
        ) : null}
      </View>

      {!hasProgress && !hasBest ? (
        <Txt variant="caption" color="text3" testID={`board-level-unmeasured-${familyId}`}>
          Logged at this level, with no counted sets to chart.
        </Txt>
      ) : mode === 'progress' ? (
        <>
          <ProgressChart
            key={`progress-${page.levelId}`}
            testID={`board-chart-plot-${familyId}`}
            title={`Level ${page.n} progress`}
            points={page.ladder.points}
            formatValue={steps}
            integerTicks
            zeroBase
            height={140}
            describeValue={(i) => page.ladder.labels[i] ?? null}
            describePoint={(i) => page.ladder.pointExercise[i] ?? null}
          />
          <Txt variant="caption" color="text3">
            Steps up this level: a heavier band counts as a step forward, even with fewer reps.
          </Txt>
        </>
      ) : (
        <>
          <ProgressChart
            key={`best-${page.levelId}`}
            testID={`board-chart-plot-${familyId}`}
            title={`Level ${page.n} best set`}
            points={best.points}
            markers={best.markers}
            formatValue={(v) => (unit ? unitLabel(unit, v) : String(v))}
            integerTicks
            height={140}
            describeValue={(i) =>
              unit && best.points[i]
                ? bestSetLabel(unit, best.points[i].value, best.pointBand[i] ?? null)
                : null
            }
            describePoint={(i) => best.pointExercise[i] ?? null}
          />
          {best.markers.length > 0 ? (
            <Txt variant="caption" color="text3">
              Dashed ticks mark a band change.
            </Txt>
          ) : null}
          {best.legend.length > 1 ? (
            <View style={styles.legend} testID={`board-best-legend-${familyId}`}>
              {best.legend.map((entry) => (
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
    pager: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
    pageTitle: { flex: 1, alignItems: 'center' },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    dot: { width: 8, height: 8, borderRadius: 4 },
  }),
);
