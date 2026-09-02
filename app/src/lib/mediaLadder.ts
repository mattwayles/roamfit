/**
 * §11.4 media ladder — pure selection logic, no I/O, no React, no native module imports.
 * Deliberately kept outside `packages/engine` (the generation engine is a different concern —
 * this never selects an exercise, load, or filter) but written with the same pure/no-I/O
 * discipline so it is trivially unit-testable and so the tier decision itself never depends on
 * anything a screen has to mock.
 *
 * **The bundled-figure tier is gone (ADR 0008).** What remains:
 *   1. Curated YouTube embed — only when online, unmetered, a curated id exists, and the
 *      exercise hasn't been locally demoted by two-or-more video flags.
 *   2. YouTube search link — a *secondary* affordance shown alongside tier 1, or on its own when
 *      online without a curated id. Constructed, so it cannot 404. `resolveMediaTier` returns
 *      only the primary tier; `buildSearchUrl` is called independently whenever `online`.
 *
 * With neither available — offline, metered, or demoted with no id — the resolved tier is
 * `cues_only`: the consumer renders no media frame at all, and the exercise's `setup` cue (the
 * "How to" block) carries the demonstration by itself. That cue is bundled and always present,
 * which is what keeps §11.6's airplane-mode gate satisfied without any bundled media.
 */

export type MediaTier = 'curated_embed' | 'cues_only';

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
  return { tier: 'cues_only', videoId: null };
}

/** The search-link tier — constructed, never 404s (invariant 8: never a bundled/recalled id).
 *  Null when offline, since a search link needs connectivity to be useful. */
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
