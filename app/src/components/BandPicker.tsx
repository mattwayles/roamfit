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
 *
 * Two variants: `compact` (default, mid-workout) is a small chip-plus-caret. `field` (the approval
 * card) is sized and styled to match that card's Sets/Reps/Rest boxes — a "Band" caption above a
 * fixed-size box — so the band control reads as one of that row's fields rather than a stray chip.
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
  variant = 'compact',
  /** Open state is uncontrolled by default (this component owns it, as it always used to).
   *  Pass both to let a caller observe/drive it instead — the approval card does, so the whole
   *  entry card can raise its own stacking order while the dropdown is open and painting over
   *  whatever card comes next in the list (see `ApprovalScreen`'s `cardElevated`). */
  open: openProp,
  onOpenChange,
}: {
  band: BandId;
  tensions: Record<BandId, BandTension>;
  onChange: (band: BandId) => void;
  testID?: string;
  accessibilityLabel: string;
  variant?: 'compact' | 'field';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}): React.JSX.Element {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const tension = tensions[band];
  const background = tension?.color ?? '#e2e8f0';
  const label = tension?.label ?? band;
  const textColor = textColorOn(background);
  const isField = variant === 'field';

  return (
    <View style={isField ? [styles.fieldRoot, open && styles.fieldRootOpen] : styles.root}>
      {isField && <Text style={styles.fieldLabel}>Band</Text>}
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: label }}
        style={isField ? [styles.fieldTrigger, { backgroundColor: background }] : styles.trigger}
        onPress={() => setOpen(!open)}
      >
        {isField ? (
          <>
            <Text style={[styles.fieldTriggerText, { color: textColor }]} numberOfLines={1}>
              {label}
            </Text>
            <Text style={[styles.fieldCaret, { color: textColor }]}>{open ? '▴' : '▾'}</Text>
          </>
        ) : (
          <>
            <BandChip band={band} tensions={tensions} />
            <Text style={styles.caret}>{open ? '▴' : '▾'}</Text>
          </>
        )}
      </Pressable>

      {open && (
        <View style={[styles.options, isField && styles.optionsField]} testID={`${testID}-options`}>
          {BAND_ORDER.map((id) => {
            const optionTension = tensions[id];
            const optionBackground = optionTension?.color ?? '#e2e8f0';
            const selected = id === band;
            return (
              <Pressable
                key={id}
                testID={`${testID}-option-${id}`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={optionTension?.label ?? id}
                style={[
                  styles.option,
                  { backgroundColor: optionBackground },
                  selected && styles.optionSelected,
                ]}
                onPress={() => {
                  onChange(id);
                  setOpen(false);
                }}
              >
                <Text style={[styles.optionText, { color: textColorOn(optionBackground) }]}>
                  {optionTension?.label ?? id}
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
  // Larger and bolder than a typical disclosure caret: this chip doubles as a card's only
  // visible cue that the band is editable, so the arrow has to read as "tap me" at a glance.
  caret: { fontSize: 18, fontWeight: '700', color: '#475569' },

  // `field` variant — matches `ApprovalScreen`'s `field`/`fieldLabel`/`fieldInputRow` sizing
  // exactly (60-wide box, same label treatment) so the band control reads as one more field in
  // that row rather than a chip that wandered in. The trigger itself is filled with the band's
  // colour, same as the chip it replaces, so the colour is still the thing a glance reaches for.
  fieldRoot: {},
  // The open dropdown is an absolute overlay (below), so it needs to paint above whatever comes
  // after it in the card — the next card in the list, most often.
  fieldRootOpen: { zIndex: 20 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  fieldTrigger: {
    height: 36,
    borderRadius: 8,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    // Same reason as `BandChip`'s: a pale user-chosen colour would otherwise vanish into the
    // card behind it.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.18)',
  },
  fieldTriggerText: { fontSize: 13, fontWeight: '800', flexShrink: 1 },
  fieldCaret: { fontSize: 13, fontWeight: '800' },

  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 4 },
  // Positioned as an overlay rather than in-flow: the field variant sits at the card's right
  // edge, and `BAND_ORDER`'s five 44pt-minimum swatches in one row are wider than the space to
  // its left, let alone its right. Anchored to the trigger's right edge and given a bounded
  // width so it wraps onto two or three rows and stays fully on screen, however narrow the phone.
  optionsField: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    width: 190,
    paddingBottom: 0,
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
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
