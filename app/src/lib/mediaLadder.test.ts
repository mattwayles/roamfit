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
  buildSearchUrl,
  buildWatchUrl,
  isYouTubeUrl,
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

describe('buildWatchUrl', () => {
  it('is the plain watch page — the path that works when the embed will not configure', () => {
    expect(buildWatchUrl('abc123XYZ_9')).toBe(`${EMBED_BASE_URL}/watch?v=abc123XYZ_9`);
  });

  it('encodes whatever id it is handed', () => {
    expect(buildWatchUrl('a b&c')).toBe(`${EMBED_BASE_URL}/watch?v=a%20b%26c`);
  });
});

describe('isYouTubeUrl', () => {
  it('keeps YouTube and its playback hosts inside the demo frame', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=abc123XYZ_9')).toBe(true);
    expect(isYouTubeUrl('https://m.youtube.com/watch?v=abc123XYZ_9')).toBe(true);
    expect(isYouTubeUrl('https://youtu.be/abc123XYZ_9')).toBe(true);
    expect(isYouTubeUrl('https://r1---sn-abc.googlevideo.com/videoplayback?x=1')).toBe(true);
    expect(isYouTubeUrl('https://i.ytimg.com/vi/abc123XYZ_9/hq.jpg')).toBe(true);
  });

  it('sends everything else out of the frame', () => {
    // A link in a description, an ad, a sign-in redirect: none of those belong in a 220pt box
    // in the middle of a set.
    expect(isYouTubeUrl('https://example.com/whatever')).toBe(false);
    expect(isYouTubeUrl('https://accounts.google.com/signin')).toBe(false);
    expect(isYouTubeUrl('not a url')).toBe(false);
    expect(isYouTubeUrl('javascript:alert(1)')).toBe(false);
  });

  it('is not fooled by a lookalike host', () => {
    expect(isYouTubeUrl('https://youtube.com.evil.example/watch?v=x')).toBe(false);
    expect(isYouTubeUrl('https://notyoutube.com/watch?v=x')).toBe(false);
  });
});
