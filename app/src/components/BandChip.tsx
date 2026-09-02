/**
 * A band shown as its own colour rather than as the text "B2".
 *
 * On a card you are reading mid-set, "B2" is an abstraction you have to decode; the colour is the
 * thing you actually reach for in the bag. Spec §1140 already stores a per-band colour precisely
 * because band brands differ, so this renders what the user says their bands are rather than a
 * palette invented here.
 *
 * The label stays inside the chip. Colour alone would fail anyone who cannot distinguish two of
 * the user's bands — including the case where they have set two of them to similar colours — so
 * this is colour *plus* text, never colour instead of text.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { BandId } from '@roamfit/engine';
import type { BandTension } from '@roamfit/store';

/**
 * Whether to put dark or light text on this fill, computed from the colour rather than stored
 * beside it — the colour is user-editable, so a stored pairing would go wrong the moment someone
 * changed a fill without changing its partner. Uses the WCAG relative-luminance coefficients;
 * `#facc15` (yellow) lands dark-on-light and `#1f2937` (near-black) light-on-dark, which is the
 * behaviour this exists for.
 *
 * Falls back to dark text on anything it cannot parse, since an unreadable chip is worse than an
 * unfashionable one.
 */
export function textColorOn(background: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(background.trim());
  if (!hex) return '#0f172a';
  const int = parseInt(hex[1], 16);
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const luminance =
    0.2126 * channel((int >> 16) & 0xff) +
    0.7152 * channel((int >> 8) & 0xff) +
    0.0722 * channel(int & 0xff);
  return luminance > 0.45 ? '#0f172a' : '#ffffff';
}

export default function BandChip({
  band,
  tensions,
}: {
  band: BandId;
  /** The user's own band settings. */
  tensions: Record<BandId, BandTension>;
}): React.JSX.Element {
  const tension = tensions[band];
  const background = tension?.color ?? '#e2e8f0';
  const label = tension?.label ?? band;
  return (
    <View
      testID={`band-chip-${band}`}
      accessibilityLabel={`Band ${label}`}
      style={[styles.chip, { backgroundColor: background }]}
    >
      <Text style={[styles.text, { color: textColorOn(background) }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minWidth: 30,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
    // A pale user-chosen colour would otherwise vanish into the card behind it.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.18)',
  },
  text: { fontSize: 11, fontWeight: '800' },
});
