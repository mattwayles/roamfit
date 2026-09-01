/**
 * §9.6/§13.5 Passport reverse-geocode — the `deviceQueueWorker.ts` (`@roamfit/store`)
 * `GeocodeCaller` seam, implemented against `expo-location`. **City/country strings only — this
 * file never reads, stores, or forwards a raw coordinate anywhere outside itself** (invariant 8's
 * passport-adjacent sibling rule, §9.6: "stores city and country strings only — never
 * coordinates"). One coarse lookup per call, no continuous tracking, no background location.
 *
 * Lazy-loaded exactly like `expo-network`/`expo-audio` elsewhere in this app — the native module
 * isn't registered under Jest.
 */
import type { GeocodeCaller } from '@roamfit/store';

type LocationModule = typeof import('expo-location');

let moduleCache: LocationModule | null | undefined;

function loadLocationModule(): LocationModule | null {
  if (moduleCache !== undefined) return moduleCache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    moduleCache = require('expo-location') as LocationModule;
  } catch {
    moduleCache = null;
  }
  return moduleCache;
}

/** Call once, e.g. from the passport opt-in toggle already in `HomeScreen.tsx`. Never throws —
 *  a denied/unavailable permission just means the next `reverseGeocode` call rejects, which
 *  `deviceQueueWorker.ts` already treats as a normal retryable-until-permanently-failed case
 *  (§11.3 backoff), never a crash. */
export async function requestLocationPermission(): Promise<void> {
  const loc = loadLocationModule();
  if (!loc) return;
  try {
    await loc.requestForegroundPermissionsAsync();
  } catch {
    // Denial or any other failure — leave it; the next reverseGeocode() call will reject too.
  }
}

/** The real `GeocodeCaller` implementation. Rejects (never resolves with a fabricated location)
 *  whenever the lookup can't complete right now — no permission, no module, no GPS fix, or the
 *  reverse-geocode call itself failing (e.g. offline, since on iOS `reverseGeocodeAsync` can hit
 *  Apple's geocoding service rather than resolving purely on-device). `deviceQueueWorker.ts`
 *  treats every rejection here as retryable via the existing exponential-backoff queue — exactly
 *  the "offline at completion, resolves later" case §11.3 describes. */
export const geocodeCaller: GeocodeCaller = {
  async reverseGeocode() {
    const loc = loadLocationModule();
    if (!loc) throw new Error('expo-location unavailable');

    const permission = await loc.getForegroundPermissionsAsync();
    if (!permission || permission.status !== 'granted') {
      throw new Error('location permission not granted');
    }

    const position = await loc.getCurrentPositionAsync({ accuracy: loc.LocationAccuracy.Low });
    const [address] = await loc.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
    if (!address || !address.city || !address.country) {
      throw new Error('reverse geocode returned no city/country');
    }
    return { city: address.city, country: address.country };
  },
};
