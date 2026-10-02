/**
 * §10.10/§9.2 — "Abandon a pending workout and start fresh" (real device-testing request).
 *
 * A pending (`planned` or `active`) session is discarded entirely via `@roamfit/store`'s
 * `discardSession` (never a parallel path — that function already exists, already logs the
 * §8.3 `abandoned` signal with the exact entry/set the user was on, and already frees the
 * §10.10 single-pending-session slot). This component only owns the UI: a two-step confirm
 * (tap -> a bottom `Sheet` "are you sure" -> confirm), so a single accidental tap can never destroy
 * logged sets. Confirming is genuinely irreversible (discarded sessions are never re-shown,
 * per §10.10's history projection), which is exactly the class of action CLAUDE.md's "confirm
 * before destroying" rule is about.
 *
 * **Never punish** (invariant 4): copy is neutral throughout — no "you gave up," no streak
 * penalty (there are no streaks to break), no guilt. Abandoning is a normal, blameless action.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { space } from '../theme';
import { Button, IconButton, Sheet, Txt, type IconButtonProps } from '../ui';

export default function AbandonSessionButton({
  onConfirm,
  label = 'Abandon workout',
  variant = 'text',
  iconSize,
}: {
  /** Called only after the user has confirmed. Expected to call `discardSession` and navigate
   *  away — this component never touches the store directly (ADR 0003 / issue #13: no
   *  persistence logic lives outside `@roamfit/store`, including "when" to call it here, which
   *  stays the caller's decision since only the caller knows the session/entry context). */
  onConfirm: () => void;
  label?: string;
  /** `'icon'` renders a stop `IconButton` instead of a text link — for the active workout screen,
   *  where controls are found at arm's length and out of breath, so they need to be targets
   *  rather than sentences. The confirm step is identical either way. */
  variant?: 'text' | 'icon';
  /** `IconButton` size for the `'icon'` variant; defaults to `md`. */
  iconSize?: IconButtonProps['size'];
}): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);

  // The safe choice is the loud one (DESIGN.md §5.11): "Keep going" is the primary button, the
  // irreversible discard is the quiet secondary. No red either way (invariant 4) — abandoning is a
  // normal, blameless action. Backdrop tap and the iOS/Android back gesture both mean "not yet",
  // the safe way out, never the destructive one.
  const confirmSheet = (
    <Sheet visible={confirming} onClose={() => setConfirming(false)} testID="abandon-sheet">
      <View style={styles.confirmBox} testID="abandon-confirm-row">
        <Txt variant="h2">Discard this workout?</Txt>
        <Txt variant="body" color="text2">
          Logged sets won&apos;t be saved to your history.
        </Txt>
        <View style={styles.confirmButtons}>
          <Button
            testID="abandon-confirm-cancel"
            label="Keep going"
            variant="primary"
            size="lg"
            onPress={() => setConfirming(false)}
          />
          <Button
            testID="abandon-confirm-yes"
            label="Discard"
            variant="secondary"
            size="md"
            fullWidth
            // Close first: `onConfirm` navigates away, but the screen underneath stays mounted
            // in the stack, so a sheet left `visible` would sit over the destination screen.
            onPress={() => {
              setConfirming(false);
              onConfirm();
            }}
          />
        </View>
      </View>
    </Sheet>
  );

  return (
    <>
      {variant === 'icon' ? (
        <IconButton
          testID="abandon-button"
          icon="stop"
          tone="text2"
          size={iconSize}
          accessibilityLabel={label}
          onPress={() => setConfirming(true)}
        />
      ) : (
        <Button
          testID="abandon-button"
          label={label}
          variant="quiet"
          size="md"
          onPress={() => setConfirming(true)}
        />
      )}
      {confirmSheet}
    </>
  );
}

const styles = StyleSheet.create({
  confirmBox: { gap: space.md },
  confirmButtons: { gap: space.sm, marginTop: space.sm },
});
