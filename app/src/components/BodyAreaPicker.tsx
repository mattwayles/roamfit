/**
 * Tap-the-body picker for the Field Guide's Body area filter: one large neutral figure, front or
 * back, whose muscle regions toggle the same `filters.primary` the chips below edit - a view on
 * that state, with none of its own. Selected regions fill with the accent, partly-selected ones
 * (some of the region's muscles chosen via the chips) are faded, the rest stay neutral. Regions
 * that map to no muscle (head, hands, feet, knees...) are drawn neutral and ignore taps.
 *
 * Hidden from VoiceOver: the chips beneath are the accessible way to the same filter.
 * Limitation: react-native-svg paths have no hitSlop, so slim regions (forearms, calves) are as
 * small as drawn; the chips are the fallback.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { makeStyles, space, useTheme, type AccentName } from '../theme';
import { Chip, Txt } from '../ui';
import { haptics } from '../lib/haptics';
import { pickerRegions, pickerShapes, type ChartSide } from '../lib/muscleMap';
import { MUSCLE_MAP_ASPECT } from './MuscleMap';

const SIDE_W = 724;
const CROP_X = 140;
const CROP_W = 444;
const HEIGHT = 1448;
const FIGURE_HEIGHT = 200;

export interface BodyAreaPickerProps {
  /** Muscle tokens the library has. */
  available: readonly string[];
  /** The current `filters.primary`. */
  selected: readonly string[];
  /** Receives the next full selection. */
  onChange: (next: string[]) => void;
  accent?: AccentName;
}

export function BodyAreaPicker({
  available,
  selected,
  onChange,
  accent = 'teal',
}: BodyAreaPickerProps): React.JSX.Element {
  const theme = useTheme();
  const styles = useStyles();
  const [side, setSide] = useState<ChartSide>('front');
  const regions = useMemo(() => pickerRegions(side, available), [side, available]);
  const shapes = useMemo(
    () =>
      pickerShapes(
        side,
        regions.map((r) => r.slug),
      ),
    [side, regions],
  );
  const fill = theme.colors[accent];

  const toggle = (tokens: string[]) => {
    haptics.selection();
    const all = tokens.every((t) => selected.includes(t));
    onChange(
      all
        ? selected.filter((v) => !tokens.includes(v))
        : [...selected, ...tokens.filter((t) => !selected.includes(t))],
    );
  };

  return (
    <View style={styles.wrap} testID="body-area-picker">
      <View style={styles.toggle}>
        {(['front', 'back'] as const).map((s) => (
          <Chip
            key={s}
            testID={`body-picker-side-${s}`}
            label={s === 'front' ? 'Front' : 'Back'}
            tone={side === s ? 'teal' : 'neutral'}
            selected={side === s}
            onPress={() => setSide(s)}
          />
        ))}
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg
          testID={`body-picker-figure-${side}`}
          width={Math.round(FIGURE_HEIGHT * MUSCLE_MAP_ASPECT)}
          height={FIGURE_HEIGHT}
          viewBox={`${(side === 'back' ? SIDE_W : 0) + CROP_X} 0 ${CROP_W} ${HEIGHT}`}
        >
          <Path d={shapes.body} fill={theme.colors.lineStrong} />
          {regions.map(({ slug, tokens }) => {
            const chosen = tokens.filter((t) => selected.includes(t)).length;
            const state = chosen === 0 ? 'none' : chosen === tokens.length ? 'all' : 'partial';
            return (
              <Path
                key={slug}
                testID={`body-picker-region-${slug}`}
                d={shapes.regions.get(slug) ?? ''}
                fill={state === 'none' ? theme.colors.lineStrong : fill}
                fillOpacity={state === 'partial' ? 0.45 : 1}
                // Neutral regions get a slightly lighter edge so they read as tappable.
                stroke={theme.colors.surface}
                strokeWidth={state === 'none' ? 2 : 0}
                onPress={() => toggle(tokens)}
              />
            );
          })}
        </Svg>
      </View>
      <Txt variant="caption" color="text3">
        Tap a muscle, or pick below
      </Txt>
    </View>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    wrap: { alignItems: 'center', gap: space.sm },
    toggle: { flexDirection: 'row', gap: space.sm },
  }),
);
