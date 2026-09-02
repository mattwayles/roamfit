/**
 * What this exercise has to be attached to, said on the set itself.
 *
 * §5.3's anchor filter already runs at generation: nothing reaches a plan that the user hasn't
 * said they have. But "I have a high point somewhere" when building the session and "this one goes
 * on the beam, not the door handle" while standing in front of it are different questions, and only
 * the first was ever answered on screen. The band was named on every set and the thing the band
 * hangs from was not.
 *
 * Self-anchored work renders nothing — stand on the band, loop it round a thigh, bodyweight — since
 * there is no fixed point to go and find, and a badge on most of the library would be noise that
 * teaches the eye to skip the one case that matters.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Anchor } from '@roamfit/data';

/**
 * Only the anchors that need a fixed point in the world. The three band heights are the ones this
 * exists for; the bodyweight-bearing three are here because "what do I attach to" is the same
 * question a user is asking mid-set, and leaving a Low-Bar Hang blank would read as "needs
 * nothing" rather than "needs a waist-height bar".
 *
 * Wording follows `GenerateScreen`'s anchor checklist, which is where the user said what they had
 * — the same fixed point should not have two different names in the two places it appears.
 */
const ANCHOR_LABELS: Partial<Record<Anchor, string>> = {
  'anchor-low': 'Low anchor',
  'anchor-mid': 'Middle anchor',
  'anchor-high': 'High anchor',
  'low-bar': 'Waist-height bar',
  'pullup-bar': 'Pull-up bar',
  'body-support': 'Bench or step',
};

export function anchorLabel(anchor: Anchor | null | undefined): string | null {
  return (anchor && ANCHOR_LABELS[anchor]) ?? null;
}

export default function AnchorBadge({
  anchor,
  testID = 'anchor-badge',
}: {
  anchor: Anchor | null | undefined;
  testID?: string;
}): React.JSX.Element | null {
  const label = anchorLabel(anchor);
  if (!label) return null;
  return (
    <View style={styles.badge} testID={testID}>
      {/* Carries the meaning on its own at a glance, which is what a control read at arm's length
          mid-set needs; the word is there for everyone the glyph does not reach. */}
      <Text style={styles.glyph}>⚓</Text>
      <Text
        style={styles.label}
        // Read as one phrase rather than as "anchor emoji, low anchor".
        accessibilityLabel={`Needs a ${label.toLowerCase()}`}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Informational, not a warning: this is a setup fact, not something the user got wrong
  // (invariant 4). Same slate the other read-only chips on the workout screen use.
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  glyph: { fontSize: 13 },
  label: { fontSize: 13, fontWeight: '700', color: '#334155' },
});
