/**
 * A band shown as its own colour rather than as the text "B2".
 *
 * On a card you are reading mid-set, "B2" is an abstraction you have to decode; the colour is the
 * thing you actually reach for in the bag. Spec §1140 already stores a per-band colour precisely
 * because band brands differ, so this renders what the user says their bands are rather than a
 * palette invented here.
 *
 * On the dark theme the chip itself is a neutral dark pill and the band's colour is a dot on it —
 * the colour is data (real-world band tension colours, user-editable), the pill is chrome.
 *
 * The label stays inside the chip. Colour alone would fail anyone who cannot distinguish two of
 * the user's bands — including the case where they have set two of them to similar colours — so
 * this is colour *plus* text, never colour instead of text.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { BandId } from '@roamfit/engine';
import type { BandTension } from '@roamfit/store';
import {
  goldenHour,
  makeStyles,
  radius,
  space,
  useTheme,
  type ColorName,
  type Theme,
} from '../theme';
import { Txt } from '../ui';

/** Which token to put on this fill: `fixedInk` (dark) or `fixedPaper` (light). Band swatches are
 *  real-world data and do not change with the theme, so neither does the legend on them. Computed from the colour rather
 *  than stored beside it — band colours are user data and user-editable, so a stored pairing would
 *  go wrong the moment someone changed a fill without changing its partner. Uses the WCAG
 *  relative-luminance coefficients; yellow lands `fixedInk` and near-black lands `fixedPaper`. Falls back to
 *  `fixedInk` on anything it cannot parse, since an unreadable chip is worse than an unfashionable one. */
export function textToneOn(background: string): ColorName {
  const hex = /^#([0-9a-f]{6})$/i.exec(background.trim());
  if (!hex) return 'fixedInk';
  const int = parseInt(hex[1], 16);
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const luminance =
    0.2126 * channel((int >> 16) & 0xff) +
    0.7152 * channel((int >> 8) & 0xff) +
    0.0722 * channel(int & 0xff);
  return luminance > 0.45 ? 'fixedInk' : 'fixedPaper';
}

/** `textToneOn` resolved to the actual color. */
export function textColorOn(background: string): string {
  // `fixedInk` / `fixedPaper` are identical in both palettes, so either one answers.
  return goldenHour[textToneOn(background) as 'fixedInk' | 'fixedPaper'];
}

/** Fill used when a band has no tension record — a neutral, not a band color. */
export function neutralBandColor(theme: Theme): string {
  return theme.colors.lineStrong;
}

export default function BandChip({
  band,
  tensions,
}: {
  band: BandId;
  /** The user's own band settings. */
  tensions: Record<BandId, BandTension>;
}): React.JSX.Element {
  const styles = useStyles();
  const theme = useTheme();
  const tension = tensions[band];
  const dot = tension?.color ?? neutralBandColor(theme);
  const label = tension?.label ?? band;
  return (
    <View
      testID={`band-chip-${band}`}
      accessible
      accessibilityLabel={`Band ${label}`}
      style={styles.chip}
    >
      <View testID={`band-chip-${band}-dot`} style={[styles.dot, { backgroundColor: dot }]} />
      <Txt variant="eyebrow" color="text" numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      minHeight: 30,
      borderRadius: radius.pill,
      paddingHorizontal: space.md,
      paddingVertical: 6,
      backgroundColor: t.colors.surface2,
      borderWidth: 1,
      borderColor: t.colors.line,
    },
    // The dot is the band. A hairline ring keeps a very dark user colour visible on the dark chip.
    dot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      marginRight: 8,
      borderWidth: 1,
      borderColor: t.colors.lineStrong,
    },
  }),
);
