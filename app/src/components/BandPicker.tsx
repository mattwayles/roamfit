/**
 * The band chip, made pressable: tap it and every band the user owns opens as a row of its own
 * colours, any of which can be chosen.
 *
 * Two places need this and they mean subtly different things by it. On approval it edits the
 * *plan* — "I'll use the red one for this" — before anything has run. Mid-workout it records what
 * actually happened on this set, which is not necessarily what was planned: the prescribed band is
 * in the other bag, or it turned out to be nothing, and the honest record is the one the user
 * picked up. The control is the same either way; only the caller's `onChange` differs.
 *
 * Note what this does *not* do: it never offers "no band", and it is only rendered where the
 * engine already prescribed one. Choosing whether an exercise is banded at all is an exercise-
 * selection decision, which belongs to the engine (invariant 2); which band is in your bag today
 * is a fact only the user has.
 *
 * Inline rather than a modal, matching `OptionPicker`: no native dependency, and on the workout
 * screen a sheet sliding over the set you are mid-way through is the wrong feel entirely.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BAND_ORDER } from '@roamfit/engine';
import type { BandId } from '@roamfit/engine';
import type { BandTension } from '@roamfit/store';
import BandChip, { textColorOn } from './BandChip';

export default function BandPicker({
  band,
  tensions,
  onChange,
  testID = 'band-picker',
  /** What choosing a band here means, in the caller's terms — "Band for this set", "Planned
   *  band". Carried by the trigger, since the chip itself only says which band it is. */
  accessibilityLabel,
}: {
  band: BandId;
  tensions: Record<BandId, BandTension>;
  onChange: (band: BandId) => void;
  testID?: string;
  accessibilityLabel: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.root}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: tensions[band]?.label ?? band }}
        style={styles.trigger}
        onPress={() => setOpen((v) => !v)}
      >
        <BandChip band={band} tensions={tensions} />
        <Text style={styles.caret}>{open ? '▴' : '▾'}</Text>
      </Pressable>

      {open && (
        <View style={styles.options} testID={`${testID}-options`}>
          {BAND_ORDER.map((id) => {
            const tension = tensions[id];
            const background = tension?.color ?? '#e2e8f0';
            const selected = id === band;
            return (
              <Pressable
                key={id}
                testID={`${testID}-option-${id}`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={tension?.label ?? id}
                style={[
                  styles.option,
                  { backgroundColor: background },
                  selected && styles.optionSelected,
                ]}
                onPress={() => {
                  onChange(id);
                  setOpen(false);
                }}
              >
                <Text style={[styles.optionText, { color: textColorOn(background) }]}>
                  {tension?.label ?? id}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignSelf: 'flex-start' },
  // The chip is small on purpose; the tappable area around it is not. 44pt tall so it is a real
  // target found mid-set, at arm's length.
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingRight: 2 },
  caret: { fontSize: 11, color: '#64748b' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 4 },
  option: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    // Same reason as BandChip's: a pale user-chosen colour would otherwise vanish into the card.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.18)',
  },
  // Colour is doing the identifying work here, so the current choice is marked by a ring rather
  // than by another colour — which would be indistinguishable from a band the user happened to
  // set to that shade.
  optionSelected: { borderWidth: 3, borderColor: '#0f172a' },
  optionText: { fontSize: 12, fontWeight: '800' },
});
