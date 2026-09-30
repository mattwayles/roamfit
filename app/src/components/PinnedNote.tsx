/**
 * §8.2 — "Distinct from [feedback] and deliberately prominent... shown verbatim in a gold
 * sticky-note component every time that exercise appears. Editable inline at any moment,
 * persisting instantly. It must be obvious that it is editable."
 */
import React, { useEffect, useState } from 'react';
import { InputAccessoryView, Keyboard, StyleSheet, TextInput, View } from 'react-native';
import { colors, radius, space, tints, type, withAlpha } from '../theme';
import { Icon, PressableScale, Txt } from '../ui';

const ACCESSORY_ID = 'pinned-note-accessory';

/**
 * Rendered as its own memoized component, not inline in PinnedNote's JSX. InputAccessoryView
 * portals to a native layer above the keyboard; if it's inline it gets torn down and rebuilt on
 * every re-render of its parent (here, every keystroke via setDraft), which reads as the keyboard
 * background jittering while typing. A `surface2` bar with an ember "Done" (DESIGN.md §5.11).
 */
const NoteAccessoryBar = React.memo(function NoteAccessoryBar(): React.JSX.Element {
  return (
    <InputAccessoryView nativeID={ACCESSORY_ID}>
      <View style={styles.accessoryBar}>
        <PressableScale
          testID="pinned-note-done"
          haptic={false}
          accessibilityRole="button"
          accessibilityLabel="Done"
          onPress={() => Keyboard.dismiss()}
          hitSlop={8}
        >
          <Txt variant="bodyStrong" color="ember">
            Done
          </Txt>
        </PressableScale>
      </View>
    </InputAccessoryView>
  );
});

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
      <NoteAccessoryBar />
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
  accessoryBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: colors.surface2,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
});
