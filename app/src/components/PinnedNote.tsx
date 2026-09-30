/**
 * §8.2 — "Distinct from [feedback] and deliberately prominent... shown verbatim in a gold
 * sticky-note component every time that exercise appears. Editable inline at any moment,
 * persisting instantly. It must be obvious that it is editable."
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { colors, radius, space, tints, type, withAlpha } from '../theme';
import { Icon, Txt } from '../ui';
import KeyboardDoneBar from './KeyboardDoneBar';

const ACCESSORY_ID = 'pinned-note-accessory';

export default function PinnedNote({
  note,
  onChange,
}: {
  note: string | null;
  onChange: (next: string) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(note ?? '');

  useEffect(() => setDraft(note ?? ''), [note]);

  // Compact while empty — one row (pin, the field, a pencil) — so an unused note costs the hero
  // below it about a line, not a card; the "your note" eyebrow appears once there is something in
  // it. The gold card, pin and pencil are what say "this is yours, and it is editable".
  return (
    <View style={styles.sticky} testID="pinned-note">
      {draft.length > 0 && (
        <View style={styles.header}>
          <Icon name="pin" size={14} color="gold" style={styles.pin} />
          <Txt variant="eyebrow" color="gold">
            Your note · tap to edit
          </Txt>
        </View>
      )}
      <View style={styles.well}>
        {draft.length === 0 && <Icon name="pin" size={16} color="gold" style={styles.pin} />}
        <TextInput
          testID="pinned-note-input"
          style={styles.input}
          value={draft}
          placeholder="Add a note for this exercise"
          placeholderTextColor={colors.text3}
          selectionColor={colors.gold}
          keyboardAppearance="dark"
          multiline
          inputAccessoryViewID={ACCESSORY_ID}
          onChangeText={setDraft}
          onBlur={() => {
            if (draft !== (note ?? '')) onChange(draft);
          }}
        />
        <Icon name="edit" size={16} color="text3" />
      </View>
      <KeyboardDoneBar nativeID={ACCESSORY_ID} testID="pinned-note-done" />
    </View>
  );
}

const styles = StyleSheet.create({
  sticky: {
    backgroundColor: tints.gold,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: withAlpha(colors.gold, 0.45),
    padding: space.sm,
    gap: space.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  pin: { marginRight: 8 },
  // The field is a well: a raised `surface2` field, so it is obvious the note can be typed into.
  well: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    minHeight: 44,
  },
  input: {
    ...type.body,
    flex: 1,
    color: colors.text,
    paddingTop: 10,
    paddingBottom: 10,
  },
});
