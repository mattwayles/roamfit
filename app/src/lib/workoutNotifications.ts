/**
 * §10.7 — "works with the screen locked or the app backgrounded — background audio session plus
 * a local notification at zero." The audio session half lives in `workoutAudio.ts`; this file is
 * the local-notification half, scoped to exactly the rest timer (the one countdown the spec
 * calls out by name for this).
 *
 * `expo-notifications` imports and calls cleanly under Jest (confirmed by probing it directly —
 * unlike `expo-audio`, see `workoutAudio.ts`'s header) and its calls silently resolve to
 * `undefined` with no real native module registered, so no lazy-loader guard is needed here.
 * That also means this file's tests can only prove "the right calls happen with the right
 * arguments," never "a notification actually appears while backgrounded" — that is a real-device
 * fact, recorded as unverified-in-Jest in the status file rather than implied.
 */
import * as Notifications from 'expo-notifications';

// Foreground presentation: the rest screen itself already shows the countdown and plays the
// zero-mark cue (`workoutAudio.ts`'s `cueRestZero`), so a system banner while the app is in the
// foreground would be redundant chrome — only worth showing once the app can't show anything
// itself (backgrounded/locked), which is exactly when the OS decides to present it regardless of
// this handler. Kept minimal: no sound/badge from the notification itself (the app's own audio
// session already owns the cue).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let permissionRequested = false;

/** Best-effort — a denied/unavailable permission must never block the rest timer itself, only
 *  the backgrounded alert. Requested once per app session (not on every rest timer) to avoid
 *  nagging. */
export async function ensureNotificationPermission(): Promise<void> {
  if (permissionRequested) return;
  permissionRequested = true;
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }
  } catch {
    // Best-effort — see file header.
  }
}

/** Schedules a local notification `secondsFromNow` out, titled for the exercise coming up next.
 *  Returns the notification id (for `cancelRestNotification`), or `null` if scheduling failed
 *  (denied permission, no native module, etc.) — callers must treat `null` as "no background
 *  alert this rest, the on-screen timer is still correct" rather than an error. */
export async function scheduleRestZeroNotification(
  secondsFromNow: number,
  nextUpLabel: string,
): Promise<string | null> {
  if (secondsFromNow <= 0) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Rest complete',
        body: `Next up: ${nextUpLabel}`,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secondsFromNow,
        repeats: false,
      },
    });
  } catch {
    return null;
  }
}

/** Cancels a previously scheduled rest-zero notification — called whenever the rest phase ends
 *  or its remaining time changes (+15s/-15s/Skip) before the original trigger would have fired,
 *  so the user never gets a stale "rest complete" alert after they've already moved on. */
export async function cancelRestNotification(id: string | null): Promise<void> {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Best-effort.
  }
}
