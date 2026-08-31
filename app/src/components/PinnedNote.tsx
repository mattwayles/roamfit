/**
 * §8.2 — "Distinct from [feedback] and deliberately prominent... shown verbatim in a yellow
 * sticky-note component every time that exercise appears. Editable inline at any moment,
 * persisting instantly. It must be obvious that it is editable."
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

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
        onChangeText={setDraft}
        onBlur={() => {
          if (draft !== (note ?? '')) onChange(draft);
        }}
      />
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
});
