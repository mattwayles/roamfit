/**
 * §10.10/§9.2 — "Abandon a pending workout and start fresh" (real device-testing request).
 *
 * A pending (`planned` or `active`) session is discarded entirely via `@roamfit/store`'s
 * `discardSession` (never a parallel path — that function already exists, already logs the
 * §8.3 `abandoned` signal with the exact entry/set the user was on, and already frees the
 * §10.10 single-pending-session slot). This component only owns the UI: a two-step confirm
 * (tap -> inline "are you sure" -> confirm), so a single accidental tap can never destroy
 * logged sets. Confirming is genuinely irreversible (discarded sessions are never re-shown,
 * per §10.10's history projection), which is exactly the class of action CLAUDE.md's "confirm
 * before destroying" rule is about.
 *
 * **Never punish** (invariant 4): copy is neutral throughout — no "you gave up," no streak
 * penalty (there are no streaks to break), no guilt. Abandoning is a normal, blameless action.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export default function AbandonSessionButton({
  onConfirm,
  label = 'Abandon workout',
  variant = 'text',
}: {
  /** Called only after the user has confirmed. Expected to call `discardSession` and navigate
   *  away — this component never touches the store directly (ADR 0003 / issue #13: no
   *  persistence logic lives outside `@roamfit/store`, including "when" to call it here, which
   *  stays the caller's decision since only the caller knows the session/entry context). */
  onConfirm: () => void;
  label?: string;
  /** `'icon'` renders a large stop button instead of a text link — for the active workout screen,
   *  where controls are found at arm's length and out of breath, so they need to be targets
   *  rather than sentences. The confirm step is identical either way. */
  variant?: 'text' | 'icon';
}): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);

  const confirmBody = (
    <View style={styles.confirmBox} testID="abandon-confirm-row">
      <Text style={styles.confirmText}>
        Discard this workout? Logged sets won&apos;t be saved to your history.
      </Text>
      <View style={styles.confirmButtons}>
        <Pressable
          testID="abandon-confirm-cancel"
          style={styles.cancelButton}
          onPress={() => setConfirming(false)}
        >
          <Text style={styles.cancelButtonText}>Keep going</Text>
        </Pressable>
        <Pressable
          testID="abandon-confirm-yes"
          style={styles.discardButton}
          // Close first: `onConfirm` navigates away, but the screen underneath stays mounted in
          // the stack, so a modal left `visible` would sit over the destination screen.
          onPress={() => {
            setConfirming(false);
            onConfirm();
          }}
        >
          <Text style={styles.discardButtonText}>Discard</Text>
        </Pressable>
      </View>
    </View>
  );

  if (variant === 'icon') {
    // The stop button lives in a fixed `space-between` control row, so the confirm step cannot
    // render *in its place* — the box's intrinsic width blows the row out and pushes the buttons
    // off the right edge of the screen. It goes in a centered modal instead: the row underneath
    // keeps its layout, and the dialog is centred and width-capped no matter how narrow the
    // slot the button sits in.
    return (
      <>
        <Pressable
          testID="abandon-button"
          accessibilityRole="button"
          accessibilityLabel={label}
          style={styles.abandonIconButton}
          onPress={() => setConfirming(true)}
        >
          <Text style={styles.abandonIconText}>■</Text>
        </Pressable>
        <Modal
          visible={confirming}
          transparent
          animationType="fade"
          // Backdrop tap and the iOS/Android back gesture both mean "not yet" — the safe way out,
          // never the destructive one.
          onRequestClose={() => setConfirming(false)}
        >
          <Pressable style={styles.backdrop} onPress={() => setConfirming(false)}>
            {/* Swallows taps on the dialog itself so they don't reach the dismissing backdrop. */}
            <Pressable style={styles.dialog} onPress={() => {}}>
              {confirmBody}
            </Pressable>
          </Pressable>
        </Modal>
      </>
    );
  }

  if (confirming) return confirmBody;

  return (
    <Pressable
      testID="abandon-button"
      style={styles.abandonButton}
      onPress={() => setConfirming(true)}
    >
      <Text style={styles.abandonButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  abandonButton: {
    alignItems: 'center',
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  abandonButtonText: { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  abandonIconButton: {
    width: 76,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  abandonIconText: { fontSize: 22, fontWeight: '800', color: '#b91c1c', lineHeight: 26 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: { width: '100%', maxWidth: 420 },
  confirmBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  confirmText: { fontSize: 13, color: '#334155' },
  confirmButtons: { flexDirection: 'row', gap: 10 },
  cancelButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
    minHeight: 44,
    justifyContent: 'center',
  },
  cancelButtonText: { fontSize: 13, fontWeight: '700', color: '#334155' },
  discardButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#fecaca',
    minHeight: 44,
    justifyContent: 'center',
  },
  discardButtonText: { fontSize: 13, fontWeight: '700', color: '#7f1d1d' },
});
