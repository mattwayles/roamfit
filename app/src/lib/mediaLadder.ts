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
 *   2. Curated YouTube embed — online, a curated id exists, and the exercise hasn't been locally
 *      demoted by two-or-more video flags.
 *   3. YouTube search link — a *secondary* affordance shown alongside an embed, or on its own
 *      when online with no video at all. Constructed, so it cannot 404. `resolveMediaTier`
 *      returns only the primary tier; `buildSearchUrl` is called independently whenever `online`.
 *
 * Both video tiers still require connectivity: a user-assigned id is a YouTube id like any other,
 * so it embeds only online, exactly as the curated one does. Neither tier is gated on a metered
 * (cellular) connection any more — a video is worth showing on cellular too. What changes on a
 * metered connection is *when* the request actually happens: `DemoMedia` holds the frame back
 * behind an explicit "load video" tap instead of fetching the watch page the moment the tier
 * resolves, so resolving to an embed tier never itself spends cellular data. That gate is a
 * rendering decision, not a selection one, so it lives in the component, not here.
 *
 * With neither available — offline, or demoted with no id — the resolved tier is `cues_only`: the
 * consumer renders no media frame at all, and the exercise's `setup` cue (the "How to" block)
 * carries the demonstration by itself. That cue is bundled and always present, which is what
 * keeps §11.6's airplane-mode gate satisfied without any bundled media.
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
  // user-assigned id can't accidentally bypass the offline rule the curated one obeys. Metered
  // (cellular) is deliberately not part of this gate — see the file header.
  const canEmbed = input.online;

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
 * The host every video URL this app builds is served from.
 *
 * **The embedded player is not used any more.** Three rounds on a real device, in this order:
 *   - The WebView pointed straight at an `/embed/` URL: "Video player configuration error" 153,
 *     because the WebView *is* the page, so the embed request carries no referring page.
 *   - Wrapped in a host document with a `baseUrl`: error 152-4.
 *   - Built through the IFrame Player API, same-site, with an explicit `origin`: error 152-4
 *     again, and the player reaches `onReady` before rendering the error itself — so no
 *     watchdog or `onError` hook can even see it happen.
 * A document loaded with `loadHTMLString` is not genuinely *served* from its `baseUrl`, and the
 * embedded player's origin checks are entitled to notice. That is not something this app can
 * argue with from the outside.
 *
 * The watch page, meanwhile, has worked in this same WebView the entire time — it is where the
 * failing player's own "Watch this video on YouTube" link goes, and it plays the right video
 * every time. So that is what the demo frame loads: the thing that works.
 *
 * What that costs, stated plainly, is §11.4's quiet player: the watch page brings YouTube's own
 * chrome and its related videos with it, and it cannot be told to start muted. `DemoMedia` keeps
 * what it still can — no autoplay (playback needs a tap), no fullscreen takeover, and navigation
 * off YouTube leaves the frame rather than wandering mid-workout.
 */
export const EMBED_BASE_URL = 'https://www.youtube.com';

/** The watch page for a video — the demo frame's source. See `EMBED_BASE_URL`. */
export function buildWatchUrl(videoId: string): string {
  return `${EMBED_BASE_URL}/watch?v=${encodeURIComponent(videoId)}`;
}

/** Whether a URL the demo frame is about to navigate to is still YouTube's own. Anything else —
 *  an ad, a link in a description, a sign-in redirect to another provider — belongs in the real
 *  browser, not in a 220pt frame in the middle of a set. */
export function isYouTubeUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const host = parsed.hostname.toLowerCase();
  return (
    host === 'youtube.com' ||
    host === 'youtu.be' ||
    host === 'youtube-nocookie.com' ||
    host.endsWith('.youtube.com') ||
    host.endsWith('.youtube-nocookie.com') ||
    host.endsWith('.googlevideo.com') ||
    host.endsWith('.ytimg.com')
  );
}
