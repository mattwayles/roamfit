/**
 * §11.4 three-tier media ladder — pure selection logic, no I/O, no React, no native module
 * imports. Deliberately kept outside `packages/engine` (the generation engine is a different
 * concern — this never selects an exercise, load, or filter) but written with the same
 * pure/no-I/O discipline so it is trivially unit-testable and so the tier decision itself never
 * depends on anything a screen has to mock.
 *
 * First match wins (brief's wording), refined against the fuller §11.4 description of what's
 * actually shown at once:
 *   1. Curated YouTube embed — only when online, unmetered, a curated id exists, and the
 *      exercise hasn't been locally demoted by two-or-more video flags.
 *   2. Bundled figure — the offline floor. Always available (100% library coverage, §11.4 tier 2)
 *      and always what's rendered underneath/instead of the embed.
 *   3. YouTube search link — a *secondary* affordance shown alongside tier 1 or tier 2 whenever
 *      online (spec: "the figure, plus the search link" when online without a curated id; "the
 *      curated embed, with the figure one tap away" when online with one) — never the ladder's
 *      primary pick, since the figure is always available and is a strictly better fallback than
 *      a search link. `resolveMediaTier` returns only the primary tier; `buildSearchUrl` is
 *      called independently by the consumer whenever `online` is true.
 */

export type MediaTier = 'curated_embed' | 'figure';

export interface MediaLadderInput {
  /** Remote-config value for this exercise, or null if none has been curated yet (§11.4 — never
   *  bundled; this must come from a synced remote-config read, track 6d's job). */
  curatedVideoId: string | null;
  online: boolean;
  /** Best-effort "metered connection with data saver on" signal — see `networkStatus.ts` for the
   *  documented iOS limitation on what this can actually detect. */
  metered: boolean;
  /** True once this exercise has accumulated 2+ video flags (user reports and/or automatic
   *  player-error flags) locally — see `exerciseStateRepo.reportVideoIssue`. */
  videoDemoted: boolean;
}

export interface MediaLadderResult {
  tier: MediaTier;
  /** Non-null only when `tier === 'curated_embed'`. */
  videoId: string | null;
}

export function resolveMediaTier(input: MediaLadderInput): MediaLadderResult {
  if (
    input.online &&
    !input.metered &&
    !input.videoDemoted &&
    input.curatedVideoId !== null &&
    input.curatedVideoId.length > 0
  ) {
    return { tier: 'curated_embed', videoId: input.curatedVideoId };
  }
  return { tier: 'figure', videoId: null };
}

/** Tier 3 — constructed, never 404s (invariant 8: never a bundled/recalled id). Null when
 *  offline, since a search link needs connectivity to be useful and §11.2 says tiers 1 and 3
 *  "give way to the bundled figure" offline. */
export function buildSearchUrl(videoSearchQuery: string, online: boolean): string | null {
  if (!online) return null;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(videoSearchQuery)}`;
}

/**
 * Tier 1 embed URL. `youtube-nocookie.com` per §11.4 player-behavior requirement.
 * - `autoplay=0` — "no autoplay" (§10.4, §11.4).
 * - `fs=0` — disables the player's own fullscreen control ("no fullscreen takeover").
 * - `playsinline=1` — iOS: play inside the WebView rather than taking over the whole screen the
 *   instant playback starts, reinforcing `fs=0`.
 * - `mute=1` — muted by design; see STATUS-6b-media-ladder.md "Decisions/gotchas" for why this is
 *   the audio-session-hijack guard rather than relying on WebView `<video>` audio-route
 *   acquisition timing, which is only verifiable on a real device.
 * - `modestbranding=1`, `rel=0` — minimal chrome, no related-video rabbit hole mid-workout.
 */
export function buildEmbedUrl(videoId: string): string {
  const params = new URLSearchParams({
    autoplay: '0',
    fs: '0',
    playsinline: '1',
    mute: '1',
    modestbranding: '1',
    rel: '0',
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}
