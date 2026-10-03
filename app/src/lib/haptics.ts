/**
 * The one place that talks to `expo-haptics` (DESIGN.md §2 "Haptics"). UI primitives call these
 * (selection tick on pickers/chips, medium impact on set complete, success on START, light on the
 * final countdown seconds); `workoutAudio.ts`'s cue helpers delegate here too, so a haptic can't
 * be defined twice with two different intensities.
 *
 * Fire-and-forget: `expo-haptics` no-ops with no native module (the simulator, Jest), and any
 * rejection is swallowed — a missed buzz must never surface as an unhandled promise or a crash.
 */
import * as Haptics from 'expo-haptics';

function fire(run: () => Promise<void>): void {
  try {
    run().catch(() => {});
  } catch {
    // Synchronous throw from a missing native module — nothing to do.
  }
}

export const haptics = {
  /** Picker / chip / toggle change. */
  selection: () => fire(() => Haptics.selectionAsync()),
  /** Final-3-seconds ticks, generic light press. */
  light: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Set complete, halfway chime, timed start. */
  medium: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** The one moment that should read bigger than an ordinary completion. */
  heavy: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  /** A hard, sharp contact — the stamp's first touch on the page. */
  rigid: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)),
  /** Last set of an exercise, START, exercise/timed completion. */
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};

export type HapticKind = keyof typeof haptics;
