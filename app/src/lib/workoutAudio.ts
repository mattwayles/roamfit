/**
 * §10.8 audio + haptics for the active workout loop. One small surface over `expo-audio` (cue
 * tones, background-capable session) and `expo-haptics` (device vibration) so screens never
 * touch the native modules directly.
 *
 * **A real Jest-vs-device gap, found and isolated here rather than papered over** (same spirit as
 * ADR 0005's `node:fs` finding): `expo-haptics` and `expo-notifications` both import cleanly
 * under Jest and silently no-op their calls (confirmed by probing both directly) — there is no
 * real native module registered, but their JS layer tolerates that. `expo-audio` does not: its
 * top-level class definition throws (`Cannot read properties of undefined (reading 'prototype')`)
 * the instant the module is `require`d, because `jest-expo`'s mock surface does not cover it.
 * So the `expo-audio` import here is isolated behind a lazy, try/caught loader — anything that
 * imports this file (including `WorkoutScreen.tsx`, which Jest exercises directly) stays
 * importable under Jest, and every exported function here degrades to a no-op when the module
 * failed to load, exactly the way it will never fail to load on a real device/simulator. Actual
 * tone playback is consequently **Jest-unverifiable by construction** — this file's own tests
 * only prove "never throws, calls the right no-op path when the native module is absent," not
 * "the tone actually sounds right." That still needs a real device run (see the status file).
 *
 * §10.8 session shape, configured once here for the life of the app:
 *   - `interruptionMode: 'duckOthers'` — audio ducks over music rather than interrupting it.
 *   - `playsInSilentMode` follows the user's own override setting (default `false`, meaning cues
 *     respect the iOS silent switch — the physical switch silences them exactly like any other
 *     non-`playsInSilentMode` app); flipping the override to `true` is the explicit escape hatch
 *     the spec calls for.
 *   - `shouldPlayInBackground: true` — required for the rest timer to keep making sound with the
 *     screen locked or the app backgrounded (§10.7).
 * **Wave 6 note**: the in-app YouTube IFrame player must never call `setAudioModeAsync` with an
 * interruption mode other than `'duckOthers'`/`'mixWithOthers'`, and must never disable
 * `shouldPlayInBackground` — either would silently steal priority from these cues. Configuring
 * the session here first and re-asserting it (`configureWorkoutAudioSession`) at the start of
 * every workout is the guard: whatever the video player last set, the workout loop reclaims the
 * session shape before it needs it again.
 */
import * as Haptics from 'expo-haptics';
import type { AudioPlayer, AudioSource } from 'expo-audio';

type ExpoAudioModule = typeof import('expo-audio');

let audioModuleCache: ExpoAudioModule | null | undefined;

function loadAudioModule(): ExpoAudioModule | null {
  if (audioModuleCache !== undefined) return audioModuleCache;
  try {
    // Must be lazy/try-caught, see the file header: a static `import` throws immediately when
    // `expo-audio` has no native module registered (e.g. under Jest).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    audioModuleCache = require('expo-audio') as ExpoAudioModule;
  } catch {
    audioModuleCache = null;
  }
  return audioModuleCache;
}

// Static requires so Metro bundles these as real assets (matches Expo's standard
// `require('./x.wav')` asset pattern — resolved at bundle time, not read from disk at runtime,
// so this has none of ADR 0005's `node:fs`-at-runtime problem).
/* eslint-disable @typescript-eslint/no-require-imports -- Metro's static asset `require(...)`
   pattern; these must be literal `require` calls (not `import`) for the bundler to resolve them
   as assets. */
const SOUNDS = {
  countBeep: require('../../assets/audio/count-beep.wav') as AudioSource,
  halfwayChime: require('../../assets/audio/halfway-chime.wav') as AudioSource,
  completionTone: require('../../assets/audio/completion-tone.wav') as AudioSource,
  restZero: require('../../assets/audio/rest-zero.wav') as AudioSource,
};
/* eslint-enable @typescript-eslint/no-require-imports */

type SoundKey = keyof typeof SOUNDS;

const players = new Map<SoundKey, AudioPlayer>();

function getPlayer(key: SoundKey): AudioPlayer | null {
  const mod = loadAudioModule();
  if (!mod) return null;
  let player = players.get(key);
  if (!player) {
    player = mod.createAudioPlayer(SOUNDS[key]);
    players.set(key, player);
  }
  return player;
}

/** §10.8 — call once per workout session (mount of the active screen). Idempotent: re-asserts
 *  the session shape every time, which is also the Wave-6-hijack guard described above.
 *  `silentSwitchOverride` is the user's persisted setting (§10.8 "a user override"); default is
 *  `false` (respect the physical silent switch). */
export async function configureWorkoutAudioSession(silentSwitchOverride: boolean): Promise<void> {
  const mod = loadAudioModule();
  if (!mod) return;
  try {
    await mod.setAudioModeAsync({
      playsInSilentMode: silentSwitchOverride,
      shouldPlayInBackground: true,
      interruptionMode: 'duckOthers',
      shouldRouteThroughEarpiece: false,
    });
  } catch {
    // Best-effort — a session config failure should never block the workout itself.
  }
}

function playSound(key: SoundKey): void {
  const player = getPlayer(key);
  if (!player) return;
  try {
    player.seekTo(0);
    player.play();
  } catch {
    // Best-effort — see file header: audio is a nice-to-have layered on top of haptics, which
    // always carry the same information (§10.8 "haptics carry the same information when muted").
  }
}

// --------------------------------------------------------------------------------------------
// Haptics — fire unconditionally (never gated by the silent switch or the audio override), so a
// muted user still gets every cue's information physically. `expo-haptics` no-ops safely when
// there is no native module (confirmed above), so no try/catch is needed at call sites.
// --------------------------------------------------------------------------------------------

export function hapticTick(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function hapticHalfway(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export function hapticStart(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export function hapticCompletion(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

// --------------------------------------------------------------------------------------------
// Combined cue helpers — one call per meaningful moment, audio + haptic together. Screens call
// these, never `playSound`/`Haptics.*` directly, so the pairing (§10.8 "haptics carry the same
// information when muted") can never drift apart between two call sites.
// --------------------------------------------------------------------------------------------

/** One tick of a 3-2-1 count (in or out). */
export function cueCount(): void {
  playSound('countBeep');
  hapticTick();
}

/** §10.5 — halfway chime on holds over 45s. */
export function cueHalfway(): void {
  playSound('halfwayChime');
  hapticHalfway();
}

/** §10.5 — start of a timed exercise (after the get-ready count-in finishes). */
export function cueStart(): void {
  hapticStart();
}

/** §10.5 — distinct completion tone at the end of a timed exercise. */
export function cueCompletion(): void {
  playSound('completionTone');
  hapticCompletion();
}

/** §10.7 — rest timer reaching zero: "audio 3-2-1 and a haptic at zero." The 3-2-1 itself is
 *  `cueCount()` fired by the caller on each of the last 3 seconds; this is the zero-mark cue. */
export function cueRestZero(): void {
  playSound('restZero');
  hapticCompletion();
}
