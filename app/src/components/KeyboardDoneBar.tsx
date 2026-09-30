/**
 * A `surface2` bar with an ember "Done" that rides above the number pad (DESIGN.md §5.11). The
 * pad has no return key of its own, so without this the keyboard can only be dismissed by tapping
 * outside. This is the app's only such bar (Approval, Summary's Trail notes, Workout's rep counter
 * and the pinned note all use it, each with its own `nativeID` and `testID`). Give the bar a `nativeID` and pass the same id as `inputAccessoryViewID` on each
 * `TextInput`. iOS-only, which is the only platform this app ships on.
 *
 * Memoized on its own: an inline `InputAccessoryView` is rebuilt on every keystroke of its parent,
 * which shows as the keyboard chrome jittering (same reason as `PinnedNote`'s).
 */
import React from 'react';
import { InputAccessoryView, Keyboard, StyleSheet, View } from 'react-native';
import { colors, space } from '../theme';
import { PressableScale, Txt } from '../ui';

const KeyboardDoneBar = React.memo(function KeyboardDoneBar({
  nativeID,
  testID = 'keyboard-done',
}: {
  nativeID: string;
  testID?: string;
}): React.JSX.Element {
  return (
    <InputAccessoryView nativeID={nativeID}>
      <View style={styles.bar}>
        <PressableScale
          testID={testID}
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

export default KeyboardDoneBar;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: colors.surface2,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
});
