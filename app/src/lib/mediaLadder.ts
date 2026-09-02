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
 * The watch page for a video — the one path that is *known* to work in this WebView, because it
 * is what the failing player's own "Watch this video on YouTube" link navigates to, in the very
 * same frame, playing the right video every time.
 *
 * It is a fallback, not the default: a watch page brings YouTube's own chrome and its related
 * videos with it, which is the mid-workout rabbit hole §11.4 wanted the embed to avoid. But a
 * noisy video beats a configuration error where a demonstration should be.
 */
export function buildWatchUrl(videoId: string): string {
  return `${EMBED_BASE_URL}/watch?v=${encodeURIComponent(videoId)}`;
}

/**
 * The host document for the player: `EMBED_BASE_URL` is its `baseUrl` — see that constant for why
 * the player cannot simply be the WebView's own URL.
 *
 * The player is built through YouTube's IFrame Player API rather than by dropping an `<iframe>`
 * in directly. Two device rounds of "Video player configuration error" (153, then 152-4) are the
 * reason: a bare iframe inside a `loadHTMLString` document is a shape the player is entitled to
 * refuse, and the API is the shape it is documented to expect — it negotiates its own origin with
 * the page it is created in instead of inferring one. This is what every working React Native
 * YouTube player does.
 *
 * The document also reports back, which the bare iframe could not do:
 *   - `player_error` with the API's own error code, if the player rejects the video.
 *   - `player_unavailable` if the API never even becomes ready, which is what a configuration
 *     error looks like from the outside — the API script loads, the player never arrives.
 * Either way the consumer can fall back to `buildWatchUrl`, rather than leaving a dead frame on
 * screen. `PLAYER_READY_TIMEOUT_MS` is generous: a slow connection must not be mistaken for a
 * broken player.
 */
export const PLAYER_READY_TIMEOUT_MS = 8000;

export type EmbedMessage =
  | { type: 'player_ready' }
  | { type: 'player_error'; code: number | null }
  | { type: 'player_unavailable' };

/** Parses what `buildEmbedHtml`'s document posts back. Anything unrecognised — including whatever
 *  else a page in a WebView might post — is null, never a guess. */
export function parseEmbedMessage(raw: string): EmbedMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { type, code } = parsed as { type?: unknown; code?: unknown };
  if (type === 'player_ready') return { type: 'player_ready' };
  if (type === 'player_unavailable') return { type: 'player_unavailable' };
  if (type === 'player_error') {
    return { type: 'player_error', code: typeof code === 'number' ? code : null };
  }
  return null;
}

export function buildEmbedHtml(videoId: string): string {
  // Only ever an id, and only ever inside a JSON string literal — but built by hand rather than
  // interpolated raw, so a malformed curated id can never end the script tag early.
  const idLiteral = JSON.stringify(videoId).replace(/</g, '\\u003c');
  return [
    '<!DOCTYPE html><html><head>',
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">',
    '<style>html,body{margin:0;padding:0;background:#f1f5f9;height:100%;overflow:hidden}',
    '#player,iframe{border:0;width:100%;height:100%;display:block}</style>',
    '</head><body><div id="player"></div><script>',
    'var post=function(m){try{window.ReactNativeWebView.postMessage(JSON.stringify(m));}catch(e){}};',
    'var settled=false;',
    'var give=function(m){if(settled)return;settled=true;post(m);};',
    `var t=setTimeout(function(){give({type:'player_unavailable'});},${PLAYER_READY_TIMEOUT_MS});`,
    'window.onYouTubeIframeAPIReady=function(){',
    "new YT.Player('player',{",
    `videoId:${idLiteral},`,
    // The same player behaviour §11.4 asks for, now as player vars rather than URL params.
    "playerVars:{autoplay:0,fs:0,playsinline:1,mute:1,modestbranding:1,rel:0,origin:'",
    EMBED_BASE_URL,
    "'},",
    "events:{onReady:function(){clearTimeout(t);give({type:'player_ready'});},",
    "onError:function(e){clearTimeout(t);give({type:'player_error',code:e&&e.data});}}",
    '});};',
    `var s=document.createElement('script');s.src='${EMBED_BASE_URL}/iframe_api';`,
    "s.onerror=function(){give({type:'player_unavailable'});};",
    'document.head.appendChild(s);',
    '</script></body></html>',
  ].join('');
}
