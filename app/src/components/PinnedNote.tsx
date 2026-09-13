/**
 * §8.2 — "Distinct from [feedback] and deliberately prominent... shown verbatim in a yellow
 * sticky-note component every time that exercise appears. Editable inline at any moment,
 * persisting instantly. It must be obvious that it is editable."
 */
import React, { useEffect, useState } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

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

  return (
    <View style={styles.sticky} testID="pinned-note">
      <Text style={styles.label}>📌 your note (tap to edit)</Text>
      <TextInput
        testID="pinned-note-input"
        style={styles.input}
        value={draft}
        placeholder="e.g. row to the hips, not the chest"
        placeholderTextColor="#a16207"
        multiline
        inputAccessoryViewID={ACCESSORY_ID}
        onChangeText={setDraft}
        onBlur={() => {
          if (draft !== (note ?? '')) onChange(draft);
        }}
      />
      <InputAccessoryView nativeID={ACCESSORY_ID}>
        <View style={styles.accessoryBar}>
          <Pressable
            testID="pinned-note-done"
            onPress={() => Keyboard.dismiss()}
            hitSlop={8}
          >
            <Text style={styles.accessoryDone}>Done</Text>
          </Pressable>
        </View>
      </InputAccessoryView>
    </View>
  );
}

const styles = StyleSheet.create({
  sticky: {
    backgroundColor: '#fef08a',
    borderRadius: 8,
    padding: 12,
    gap: 4,
    transform: [{ rotate: '-0.5deg' }],
  },
  label: { fontSize: 11, fontWeight: '700', color: '#854d0e' },
  input: { fontSize: 14, color: '#422006', minHeight: 20 },
  accessoryBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d1d5db',
  },
  accessoryDone: { fontSize: 16, fontWeight: '600', color: '#2563eb' },
});
