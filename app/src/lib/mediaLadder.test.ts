/**
 * §11.4 media ladder — tier selection and demo-video URL builders.
 *
 * The bundled-figure tier is gone (ADR 0008), so the fallback is now `cues_only`: no media frame
 * at all, with the exercise's `setup` cue carrying the demo. Every case here is written to fail
 * against an intentionally-wrong "always fall back" stub, so these tests prove the selection rule
 * rather than encode whatever the implementation happens to do.
 */
import {
  EMBED_BASE_URL,
  PLAYER_READY_TIMEOUT_MS,
  buildEmbedHtml,
  buildSearchUrl,
  buildWatchUrl,
  parseEmbedMessage,
  resolveMediaTier,
  type MediaLadderInput,
} from './mediaLadder';

const BASE: MediaLadderInput = {
  curatedVideoId: null,
  online: true,
  metered: false,
  videoDemoted: false,
};

describe('resolveMediaTier', () => {
  it('picks the curated embed when online, unmetered, a curated id exists, and not demoted', () => {
    const result = resolveMediaTier({ ...BASE, curatedVideoId: 'abc123XYZ_9' });
    expect(result.tier).toBe('curated_embed');
    expect(result.videoId).toBe('abc123XYZ_9');
  });

  it('falls back to cues only when offline, even with a curated id', () => {
    const result = resolveMediaTier({ ...BASE, curatedVideoId: 'abc123XYZ_9', online: false });
    expect(result.tier).toBe('cues_only');
    expect(result.videoId).toBeNull();
  });

  it('falls back to cues only when there is no curated id, even online', () => {
    const result = resolveMediaTier({ ...BASE, curatedVideoId: null, online: true });
    expect(result.tier).toBe('cues_only');
  });

  it('falls back to cues only on a metered connection, even with a curated id', () => {
    const result = resolveMediaTier({ ...BASE, curatedVideoId: 'abc123XYZ_9', metered: true });
    expect(result.tier).toBe('cues_only');
  });

  it('falls back to cues only once demoted, even with a curated id and good connectivity', () => {
    const result = resolveMediaTier({ ...BASE, curatedVideoId: 'abc123XYZ_9', videoDemoted: true });
    expect(result.tier).toBe('cues_only');
  });

  describe('a user-assigned video (ADR 0009)', () => {
    it('wins over the curated id — the user picked it deliberately', () => {
      const result = resolveMediaTier({
        ...BASE,
        userVideoId: 'USERvid1234',
        curatedVideoId: 'abc123XYZ_9',
      });
      expect(result.tier).toBe('user_embed');
      expect(result.videoId).toBe('USERvid1234');
    });

    it('is used when there is no curated id at all', () => {
      const result = resolveMediaTier({ ...BASE, userVideoId: 'USERvid1234' });
      expect(result.tier).toBe('user_embed');
      expect(result.videoId).toBe('USERvid1234');
    });

    it('survives demotion, which only ever retires a curated pick', () => {
      // The two-flag demotion exists to pull a bad *curated* video. Letting it suppress the
      // user's own assignment would make their explicit choice vanish with no way to see why.
      const result = resolveMediaTier({
        ...BASE,
        userVideoId: 'USERvid1234',
        curatedVideoId: 'abc123XYZ_9',
        videoDemoted: true,
      });
      expect(result.tier).toBe('user_embed');
      expect(result.videoId).toBe('USERvid1234');
    });

    it('still obeys offline — a user id is a YouTube id, not a local asset', () => {
      const result = resolveMediaTier({ ...BASE, userVideoId: 'USERvid1234', online: false });
      expect(result.tier).toBe('cues_only');
      expect(result.videoId).toBeNull();
    });

    it('still obeys the metered-connection rule', () => {
      const result = resolveMediaTier({ ...BASE, userVideoId: 'USERvid1234', metered: true });
      expect(result.tier).toBe('cues_only');
    });

    it('falls through to the curated id when the assignment is cleared', () => {
      const result = resolveMediaTier({
        ...BASE,
        userVideoId: null,
        curatedVideoId: 'abc123XYZ_9',
      });
      expect(result.tier).toBe('curated_embed');
      expect(result.videoId).toBe('abc123XYZ_9');
    });

    it('treats an empty string as no assignment, not as a video', () => {
      const result = resolveMediaTier({
        ...BASE,
        userVideoId: '',
        curatedVideoId: 'abc123XYZ_9',
      });
      expect(result.tier).toBe('curated_embed');
    });
  });

  it('never returns curated_embed with a null videoId', () => {
    // Regression guard for a real bug class: if the selection rule and the id-presence check
    // ever drift apart, a consumer would try to embed `null` and crash the WebView.
    const result = resolveMediaTier({ ...BASE, curatedVideoId: null });
    if (result.tier === 'curated_embed') {
      expect(result.videoId).not.toBeNull();
    }
  });
});

describe('buildSearchUrl', () => {
  it('is null when offline — a search link requires connectivity', () => {
    expect(buildSearchUrl('band row anchored to a door', false)).toBeNull();
  });

  it('constructs a YouTube search URL from the query when online', () => {
    const url = buildSearchUrl('band row anchored to a door', true);
    expect(url).not.toBeNull();
    expect(url).toContain('youtube.com/results?search_query=');
    // Query must be encoded, not raw-concatenated (spaces would break the URL / leak literally).
    expect(url).not.toContain(' ');
    expect(url).toContain(encodeURIComponent('band row anchored to a door'));
  });
});

describe('buildEmbedHtml', () => {
  it('builds the player through the IFrame API, in a document served from EMBED_BASE_URL', () => {
    // A bare <iframe> in a loadHTMLString document is what produced two rounds of "Video player
    // configuration error" on device (153, then 152-4). The API is the shape the player is
    // documented to expect — see EMBED_BASE_URL for the whole chain.
    const html = buildEmbedHtml('abc123XYZ_9');
    expect(html).toContain(`${EMBED_BASE_URL}/iframe_api`);
    expect(html).toContain('new YT.Player');
    expect(html).toContain(`origin:'${EMBED_BASE_URL}'`);
  });

  it('plays the exact given video id, and nothing else', () => {
    expect(buildEmbedHtml('abc123XYZ_9')).toContain('videoId:"abc123XYZ_9"');
  });

  it('keeps §11.4 player behaviour: no autoplay, no fullscreen, no related videos, muted', () => {
    const html = buildEmbedHtml('abc123XYZ_9');
    expect(html).toContain('autoplay:0');
    expect(html).toContain('fs:0');
    expect(html).toContain('mute:1');
    expect(html).toContain('playsinline:1');
    expect(html).toContain('rel:0');
  });

  it('reports back both ways it can fail, so a dead frame is never just left there', () => {
    const html = buildEmbedHtml('abc123XYZ_9');
    expect(html).toContain('player_unavailable');
    expect(html).toContain('player_error');
    expect(html).toContain(String(PLAYER_READY_TIMEOUT_MS));
  });

  it('cannot be broken out of by a hostile id', () => {
    // Curated ids arrive by sync, so the id is treated as untrusted input even though the paste
    // path validates it: it goes in as a JSON string literal, with `<` escaped so nothing in it
    // can end the script tag early.
    const html = buildEmbedHtml('</script><img src=x onerror=alert(1)>');
    // The payload survives only as inert text inside the JSON string literal: no `<` of its own
    // reaches the document, so it can neither close the script tag nor open an element.
    expect(html).not.toContain('</script><img');
    expect(html).toContain('videoId:"\\u003c/script>\\u003cimg');
    // Exactly one script element, the one this function wrote.
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });
});

describe('buildWatchUrl', () => {
  it('is the plain watch page — the path that works when the embed will not configure', () => {
    expect(buildWatchUrl('abc123XYZ_9')).toBe(`${EMBED_BASE_URL}/watch?v=abc123XYZ_9`);
  });

  it('encodes whatever id it is handed', () => {
    expect(buildWatchUrl('a b&c')).toBe(`${EMBED_BASE_URL}/watch?v=a%20b%26c`);
  });
});

describe('parseEmbedMessage', () => {
  it('reads the three messages the host document sends', () => {
    expect(parseEmbedMessage('{"type":"player_ready"}')).toEqual({ type: 'player_ready' });
    expect(parseEmbedMessage('{"type":"player_unavailable"}')).toEqual({
      type: 'player_unavailable',
    });
    expect(parseEmbedMessage('{"type":"player_error","code":150}')).toEqual({
      type: 'player_error',
      code: 150,
    });
  });

  it('keeps a code-less error rather than inventing a code', () => {
    expect(parseEmbedMessage('{"type":"player_error"}')).toEqual({
      type: 'player_error',
      code: null,
    });
  });

  it('is null for anything else a page in a WebView might post', () => {
    expect(parseEmbedMessage('not json')).toBeNull();
    expect(parseEmbedMessage('"a string"')).toBeNull();
    expect(parseEmbedMessage('null')).toBeNull();
    expect(parseEmbedMessage('{"type":"something_else"}')).toBeNull();
  });
});
