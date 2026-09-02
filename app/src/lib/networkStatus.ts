/**
 * §11.4 media-ladder connectivity signal — online + "metered" detection for the tier-1/tier-3
 * gate. Lazy-loaded exactly like `expo-audio` in `workoutAudio.ts`: `expo-network`'s native
 * module isn't registered under Jest, so a static top-level import would throw the moment this
 * file (or anything that imports it, including `DemoMedia.tsx`/`WorkoutScreen.tsx`) is required
 * by a test. Every exported function here degrades to the *safe* default (offline, unmetered
 * treated as "can't confirm cellular, so don't force an extra skip on top of being offline
 * anyway") when the native module is unavailable — never to "assume online," since invariant 1
 * (never a dead player) means the failure mode must always be safe to fall back toward the
 * cue text, not toward attempting an embed.
 *
 * **Known, documented limitation — read before relying on `metered`:** neither `expo-network` nor
 * any other Expo/RN API exposes iOS's system "Data Saver" / Low Data Mode toggle to JavaScript.
 * There is no way to detect "metered connection with data saver on" as the spec literally states.
 * `metered` here is approximated as `NetworkStateType.CELLULAR` — cellular is skipped
 * unconditionally, not only when Low Data Mode happens to also be on. This is intentionally
 * conservative (skips tier 1 *more* than the spec strictly requires, never less) and is a real
 * gap, not a proven equivalence — flagged in STATUS-6b-media-ladder.md as a carried-forward
 * limitation for whoever eventually gets a native module that can read the real flag.
 */

type ExpoNetworkModule = typeof import('expo-network');

let networkModuleCache: ExpoNetworkModule | null | undefined;

function loadNetworkModule(): ExpoNetworkModule | null {
  if (networkModuleCache !== undefined) return networkModuleCache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    networkModuleCache = require('expo-network') as ExpoNetworkModule;
  } catch {
    networkModuleCache = null;
  }
  return networkModuleCache;
}

export interface NetworkStatus {
  online: boolean;
  /** Best-effort cellular-as-metered proxy — see file header. */
  metered: boolean;
}

const SAFE_DEFAULT: NetworkStatus = { online: false, metered: false };

/** One-shot read, for call sites that don't need to react to a live change (e.g. deciding what
 *  to render on mount). Never throws — resolves to `SAFE_DEFAULT` on any failure, matching the
 *  "never a dead player" invariant: an unknown network state must never be treated as "safe to
 *  try an embed." */
export async function getNetworkStatus(): Promise<NetworkStatus> {
  const mod = loadNetworkModule();
  if (!mod) return SAFE_DEFAULT;
  try {
    const state = await mod.getNetworkStateAsync();
    const online = state.isInternetReachable ?? state.isConnected ?? false;
    const metered = state.type === mod.NetworkStateType.CELLULAR;
    return { online, metered };
  } catch {
    return SAFE_DEFAULT;
  }
}
