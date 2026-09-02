/**
 * Parse a user-pasted YouTube URL down to a bare video id. Pure, no I/O, no React — same
 * discipline as `mediaLadder.ts`, and for the same reason: this is the gate that decides what
 * reaches storage and the embed builder, so it has to be testable without mounting anything.
 *
 * **This is the invariant-8 boundary.** The rule is "never invent a YouTube video id" — ids must
 * come from a real, checked source, never from something recalled or constructed. A user pasting
 * a link to a video they are looking at is exactly such a source; this function's job is to make
 * sure what gets stored is *only* what they actually supplied, in a shape the player can use.
 * Anything it cannot confidently read is rejected rather than guessed at.
 *
 * Accepted shapes (with or without scheme, `www.`/`m.` subdomain, and any extra query params):
 *   https://www.youtube.com/watch?v=ID        the standard desktop share URL
 *   https://youtu.be/ID                       the short share URL
 *   https://www.youtube.com/embed/ID          an embed/iframe URL
 *   https://www.youtube.com/shorts/ID         a Short
 *   https://www.youtube.com/live/ID           a livestream permalink
 *   ID                                        a bare 11-character id, pasted alone
 *
 * Deliberately NOT accepted: playlist-only URLs (`/playlist?list=…`) and channel/user URLs. They
 * carry no single video to embed, and silently picking "the first video" would be inventing a
 * choice the user did not make.
 */

/** YouTube ids are exactly 11 chars from the URL-safe base64 alphabet. Anchored, so a longer
 *  lookalike is rejected outright rather than truncated into a plausible-but-wrong id. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** Path-based forms: /embed/ID, /shorts/ID, /live/ID, and youtu.be/ID. */
const PATH_FORMS = /^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/;

function hostIsYouTube(host: string): boolean {
  const h = host.toLowerCase().replace(/^(www\.|m\.)/, '');
  return h === 'youtube.com' || h === 'youtu.be' || h === 'youtube-nocookie.com';
}

/**
 * Returns the video id, or `null` if the input is not a single-video YouTube link.
 *
 * Never throws — a paste is user input arriving mid-workout, and the caller's job is to show a
 * quiet inline message, not to handle an exception.
 */
export function parseYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  // A bare id, pasted on its own. Checked before URL parsing so an 11-char id containing no
  // slashes or dots doesn't get misread as a hostname.
  if (VIDEO_ID.test(trimmed)) return trimmed;

  // `new URL` needs a scheme; users routinely paste "youtube.com/watch?v=..." without one.
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (!hostIsYouTube(url.hostname)) return null;

  // youtu.be/ID — the id is the entire path.
  if (url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '') === 'youtu.be') {
    const id = url.pathname.slice(1);
    return VIDEO_ID.test(id) ? id : null;
  }

  // /watch?v=ID — the `v` param wins even when a `list` param rides along, which is the common
  // case for a video shared from inside a playlist. The user pointed at a video; take the video.
  const v = url.searchParams.get('v');
  if (v !== null) return VIDEO_ID.test(v) ? v : null;

  const pathMatch = PATH_FORMS.exec(url.pathname);
  if (pathMatch) return pathMatch[1];

  return null;
}
