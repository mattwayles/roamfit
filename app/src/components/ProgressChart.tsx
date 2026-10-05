/**
 * A small SVG line chart for "how has this changed over time": one value per session, positioned
 * by `local_date` so the spacing is honest about gaps (`lib/chartGeometry.ts` does the maths).
 *
 * - y gridlines are labelled in the chart's own unit; grid and axes are recessive (`line`/`text3`).
 * - Tap near a point to read its date and value underneath (a nearest-point tap on the whole plot,
 *   so the target is the full chart height rather than a 6px dot).
 * - Optional `markers` draw dashed vertical ticks with a short label. A `rung` marker ("L4", a level
 *   change) is labelled above the plot; a `band` marker ("B3", the band changed) is labelled inside
 *   the plot beside its tick, in the quieter text tone, so the two never fight for space.
 * - Optional `segments` (a `segment` index per point) colour the line per exercise / rung; the
 *   colours come from `segmentTones`, in fixed order, never cycled by rank.
 * - Width comes from `onLayout`; nothing is drawn until it is measured (a 0-wide SVG logs NaN).
 * - Theme tokens only. Text wears text tokens; the series colour sits on the marks, not the words.
 * - Never punishing: one neutral line colour, no red, no downward shading.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { makeStyles, space, useTheme, type AccentName } from '../theme';
import {
  layoutChart,
  linePath,
  nearestPointIndex,
  stepPath,
  type ChartMarker,
  type SeriesPoint,
} from '../lib/chartGeometry';
import { formatLocalDate } from '../lib/exerciseProgress';
import { Txt } from '../ui';

export type { ChartMarker, SeriesPoint };

/** Fixed order; `rose` is reserved for cardio and so never appears here. */
export const SEGMENT_TONES: readonly AccentName[] = ['teal', 'sky', 'gold', 'fern', 'summit'];

export interface ProgressChartProps {
  points: readonly SeriesPoint[];
  markers?: readonly ChartMarker[];
  /** "12 reps", "30s", "Rung 3" — used in the tap readout and the accessibility summary. */
  formatValue: (value: number) => string;
  /** Axis label; defaults to the bare number. */
  formatAxis?: (value: number) => string;
  /** Names the chart for assistive tech: "Best set". */
  title: string;
  /** Draw as a step line (a rung that holds until the next change). */
  step?: boolean;
  integerTicks?: boolean;
  zeroBase?: boolean;
  segmentTones?: readonly AccentName[];
  /** Optional readout text for a tapped point (e.g. to name the exercise). */
  describePoint?: (index: number) => string | null;
  /** Replaces `formatValue` in the tap readout for one point ("8 reps @ B3"); null falls back. */
  describeValue?: (index: number) => string | null;
  height?: number;
  testID?: string;
}

const PAD = { left: 38, right: 8, top: 18, bottom: 22 };

export function ProgressChart({
  points,
  markers = [],
  formatValue,
  formatAxis,
  title,
  step = false,
  integerTicks = false,
  zeroBase = false,
  segmentTones = SEGMENT_TONES,
  describePoint,
  describeValue,
  height = 180,
  testID = 'progress-chart',
}: ProgressChartProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.floor(e.nativeEvent.layout.width));

  const layout = layoutChart(
    points,
    markers,
    { width, height, ...PAD },
    { integerTicks, zeroBase },
  );
  const toneColor = (segment: number) =>
    theme.colors[segmentTones[segment % segmentTones.length] ?? 'teal'];

  const first = points[0];
  const last = points[points.length - 1];
  const summary =
    first && last
      ? points.length === 1
        ? `${title}: ${formatValue(first.value)} on ${formatLocalDate(first.localDate)}`
        : `${title}: ${formatValue(first.value)} on ${formatLocalDate(first.localDate)} to ${formatValue(last.value)} on ${formatLocalDate(last.localDate)}`
      : `${title}: no data`;

  const sel = selected !== null && selected < points.length ? points[selected] : null;
  const selNote = sel && selected !== null ? describePoint?.(selected) : null;

  // Marker labels are skipped when they would sit on top of the previous one (per kind).
  let lastLabelX = -Infinity;
  let lastBandLabelX = -Infinity;

  return (
    <View testID={testID} style={styles.wrap}>
      <View
        testID={`${testID}-area`}
        onLayout={onLayout}
        style={{ height }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={summary}
      >
        {width > 0 && layout.points.length > 0 ? (
          <>
            <Svg width={width} height={height} pointerEvents="none">
              {layout.yTicks.map((t) => (
                <React.Fragment key={t.value}>
                  <Line
                    x1={layout.plot.x0}
                    x2={layout.plot.x1}
                    y1={t.y}
                    y2={t.y}
                    stroke={theme.colors.line}
                    strokeWidth={1}
                  />
                  <SvgText
                    x={layout.plot.x0 - 6}
                    y={t.y + 3.5}
                    fontSize={10}
                    textAnchor="end"
                    fill={theme.colors.text3}
                  >
                    {formatAxis ? formatAxis(t.value) : String(t.value)}
                  </SvgText>
                </React.Fragment>
              ))}

              {layout.markers.map((m, i) => {
                const isBand = m.kind === 'band';
                const showLabel = isBand ? m.x - lastBandLabelX >= 22 : m.x - lastLabelX >= 26;
                if (showLabel) {
                  if (isBand) lastBandLabelX = m.x;
                  else lastLabelX = m.x;
                }
                const nearRight = m.x > layout.plot.x1 - 24;
                return (
                  <React.Fragment key={`${m.localDate}-${i}`}>
                    <Line
                      x1={m.x}
                      x2={m.x}
                      y1={layout.plot.y0 - 4}
                      y2={layout.plot.y1}
                      stroke={isBand ? theme.colors.line : theme.colors.lineStrong}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                    {showLabel ? (
                      <SvgText
                        x={isBand ? m.x + (nearRight ? -3 : 3) : m.x}
                        y={isBand ? layout.plot.y0 + 10 : layout.plot.y0 - 7}
                        fontSize={10}
                        textAnchor={isBand ? (nearRight ? 'end' : 'start') : 'middle'}
                        fill={isBand ? theme.colors.text3 : theme.colors.text2}
                      >
                        {m.label}
                      </SvgText>
                    ) : null}
                  </React.Fragment>
                );
              })}

              {layout.runs.map((run, i) =>
                run.points.length > 1 ? (
                  <Path
                    key={`run-${i}`}
                    d={step ? stepPath(run.points) : linePath(run.points)}
                    stroke={toneColor(run.segment)}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    fill="none"
                  />
                ) : null,
              )}

              {layout.points.map((p) => (
                <Circle
                  key={p.index}
                  cx={p.x}
                  cy={p.y}
                  r={p.index === selected ? 5 : 3.5}
                  fill={toneColor(p.segment)}
                  stroke={theme.colors.surface}
                  strokeWidth={2}
                />
              ))}

              <SvgText
                x={layout.plot.x0}
                y={height - 6}
                fontSize={10}
                textAnchor="start"
                fill={theme.colors.text3}
              >
                {layout.startDate ? formatLocalDate(layout.startDate) : ''}
              </SvgText>
              {layout.endDate && layout.endDate !== layout.startDate ? (
                <SvgText
                  x={layout.plot.x1}
                  y={height - 6}
                  fontSize={10}
                  textAnchor="end"
                  fill={theme.colors.text3}
                >
                  {formatLocalDate(layout.endDate)}
                </SvgText>
              ) : null}
            </Svg>
            <Pressable
              testID={`${testID}-touch`}
              accessible={false}
              style={[styles.touch, { left: layout.plot.x0, right: PAD.right }]}
              onPress={(e) => {
                const i = nearestPointIndex(
                  layout.points,
                  e.nativeEvent.locationX + layout.plot.x0,
                );
                setSelected(i < 0 ? null : i);
              }}
            />
          </>
        ) : null}
      </View>
      <Txt testID={`${testID}-readout`} variant="caption" color={sel ? 'text2' : 'text3'}>
        {sel
          ? `${formatLocalDate(sel.localDate)} · ${(selected !== null ? describeValue?.(selected) : null) ?? formatValue(sel.value)}${selNote ? ` · ${selNote}` : ''}`
          : points.length > 1
            ? 'Tap the chart to see a session'
            : ' '}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    wrap: { gap: space.xs },
    touch: { position: 'absolute', top: 0, bottom: 0 },
  }),
);
