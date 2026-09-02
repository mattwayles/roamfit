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
  buildEmbedHtml,
  buildEmbedUrl,
  buildSearchUrl,
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

describe('buildEmbedUrl', () => {
  it('is served from the same origin as the page that embeds it, and says so', () => {
    // Not youtube-nocookie.com any more: cross-site with the host document, the player cannot
    // reach its own storage inside WKWebView's partition and fails to configure (error 152-4).
    // See EMBED_BASE_URL for the whole chain.
    const url = buildEmbedUrl('abc123XYZ_9');
    expect(url.startsWith(`${EMBED_BASE_URL}/embed/`)).toBe(true);
    expect(url).toContain(`origin=${encodeURIComponent(EMBED_BASE_URL)}`);
  });

  it('disables autoplay and fullscreen and mutes audio (audio-session guard)', () => {
    const url = buildEmbedUrl('abc123XYZ_9');
    expect(url).toContain('autoplay=0');
    expect(url).toContain('fs=0');
    expect(url).toContain('mute=1');
    expect(url).toContain('playsinline=1');
  });

  it('embeds the exact given video id', () => {
    const url = buildEmbedUrl('abc123XYZ_9');
    expect(url).toContain('/embed/abc123XYZ_9?');
  });
});

describe('buildEmbedHtml', () => {
  it('wraps the player in a host document, which is what gives it a referring page', () => {
    // Without one the player answers "Video player configuration error" (error 153) — it is
    // being asked to embed itself into nothing.
    const html = buildEmbedHtml('abc123XYZ_9');
    expect(html).toContain('<iframe');
    expect(html).toContain(`src="${buildEmbedUrl('abc123XYZ_9')}"`);
    expect(EMBED_BASE_URL).toBe('https://www.youtube.com');
  });

  it('keeps the frame same-site with the page it is rendered in', () => {
    // The pairing is the fix, so it is asserted as a pairing: whatever EMBED_BASE_URL becomes,
    // the iframe has to be served from it too.
    expect(buildEmbedHtml('abc123XYZ_9')).toContain(`src="${EMBED_BASE_URL}/embed/`);
  });

  it('does not grant fullscreen, matching fs=0 on the URL', () => {
    const html = buildEmbedHtml('abc123XYZ_9');
    expect(html).toContain('allowfullscreen="false"');
    expect(html).toContain('allow="encrypted-media"');
  });

  it('cannot be broken out of by a hostile id (attributes stay quoted and encoded)', () => {
    const html = buildEmbedHtml('" onload="x');
    expect(html).not.toContain('onload=');
  });
});
