/**
 * §11.4 media ladder — pure selection logic, no I/O, no React, no native module imports.
 * Deliberately kept outside `packages/engine` (the generation engine is a different concern —
 * this never selects an exercise, load, or filter) but written with the same pure/no-I/O
 * discipline so it is trivially unit-testable and so the tier decision itself never depends on
 * anything a screen has to mock.
 *
 * **The bundled-figure tier is gone (ADR 0008).** What remains:
 *   1. The user's own assigned video (ADR 0009) — an id they pasted from the workout screen.
 *      Wins over the curated id: they picked it deliberately, for this exercise, and a curated
 *      id arriving later by sync must not silently replace their choice. Not subject to the
 *      two-flag demotion either — demotion exists to retire a *curated* pick that turned out
 *      wrong, and the user can simply reassign or clear their own.
 *   2. Curated YouTube embed — online, unmetered, a curated id exists, and the exercise hasn't
 *      been locally demoted by two-or-more video flags.
 *   3. YouTube search link — a *secondary* affordance shown alongside an embed, or on its own
 *      when online with no video at all. Constructed, so it cannot 404. `resolveMediaTier`
 *      returns only the primary tier; `buildSearchUrl` is called independently whenever `online`.
 *
 * Both video tiers still require connectivity: a user-assigned id is a YouTube id like any other,
 * so it embeds only online and unmetered, exactly as the curated one does.
 *
 * With neither available — offline, metered, or demoted with no id — the resolved tier is
 * `cues_only`: the consumer renders no media frame at all, and the exercise's `setup` cue (the
 * "How to" block) carries the demonstration by itself. That cue is bundled and always present,
 * which is what keeps §11.6's airplane-mode gate satisfied without any bundled media.
 */

export type MediaTier = 'user_embed' | 'curated_embed' | 'cues_only';

export interface MediaLadderInput {
  /** The user's own assigned id for this exercise (ADR 0009), or null. Read from
   *  `exerciseStateRepo.getUserVideoId` — local, per-user, never synced from remote config. */
  userVideoId?: string | null;
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
  /** Non-null exactly when `tier` is `'user_embed'` or `'curated_embed'`. */
  videoId: string | null;
}

export function resolveMediaTier(input: MediaLadderInput): MediaLadderResult {
  // Connectivity gates every embed, whoever chose it. Checked once, before the tier order, so a
  // user-assigned id can't accidentally bypass the metered/offline rules the curated one obeys.
  const canEmbed = input.online && !input.metered;

  const userVideoId = input.userVideoId ?? null;
  if (canEmbed && userVideoId !== null && userVideoId.length > 0) {
    return { tier: 'user_embed', videoId: userVideoId };
  }

  if (
    canEmbed &&
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
 * The origin the player is served from *and* the origin of the page it is embedded in — one
 * constant for both, deliberately, because they have to match.
 *
 * The story so far, from real-device reports:
 *   - A WebView pointed straight at an `/embed/` URL *is* the page, so the request carries no
 *     referring page: "Video player configuration error", error 153.
 *   - Wrapping it in a host document fixed the referrer, but the document was on youtube.com
 *     while the player was on youtube-nocookie.com. WKWebView partitions storage by site and
 *     blocks third-party cookies by default, so the player could not reach its own storage from
 *     inside a cross-site frame: error 152-4, the next configuration error along.
 * Same-site host page and player is what a browser embed on a real website effectively gets, and
 * it is the configuration every working React Native YouTube player uses.
 *
 * The cost is `youtube-nocookie.com`, which §11.4 asked for: a player that will not run is worth
 * less than the cookie-domain nicety, and nothing else about §11.4's player behaviour changes —
 * no autoplay, no fullscreen, no related videos, muted. The player is also never given the user's
 * identity by this app, and the WebView is dropped from the tree the moment the block is closed.
 *
 * (The tell throughout: the player's own "Watch this video on YouTube" link works in the very
 * same WebView. That path is a normal watch page, which has neither requirement.)
 */
export const EMBED_BASE_URL = 'https://www.youtube.com';

/**
 * Tier 1 embed URL, on `EMBED_BASE_URL`'s origin — see there for why it is no longer the
 * no-cookie host.
 * - `origin=` — the embedding page, which the player cross-checks against the referrer it was
 *   actually given. Stating it explicitly is what turns "some page, somewhere" into a claim the
 *   player can verify, and it is the same value the host document is served with.
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
    origin: EMBED_BASE_URL,
    autoplay: '0',
    fs: '0',
    playsinline: '1',
    mute: '1',
    modestbranding: '1',
    rel: '0',
  });
  return `${EMBED_BASE_URL}/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
}

/**
 * The host document for `buildEmbedUrl`'s player: a full-bleed iframe and nothing else. Rendered
 * with `EMBED_BASE_URL` as its `baseUrl` — see that constant for why the iframe cannot simply be
 * the WebView's own URL.
 *
 * `allow="encrypted-media"` is what lets a DRM-served video play at all inside an iframe;
 * fullscreen is deliberately not granted, matching the `fs=0` on the URL.
 */
export function buildEmbedHtml(videoId: string): string {
  return [
    '<!DOCTYPE html><html><head>',
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">',
    '<style>html,body{margin:0;padding:0;background:#f1f5f9;height:100%;overflow:hidden}',
    'iframe{border:0;width:100%;height:100%;display:block}</style>',
    '</head><body>',
    `<iframe src="${buildEmbedUrl(videoId)}" allow="encrypted-media" allowfullscreen="false"></iframe>`,
    '</body></html>',
  ].join('');
}
