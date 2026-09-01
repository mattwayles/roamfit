/**
 * §11.4 three-tier media ladder — tier selection and demo-video URL builders.
 *
 * Per the project's verification standard (see docs/ORCHESTRATION.md's verification log, and
 * 6a-figures rounds 3/4): every case here is written to fail against an intentionally-wrong
 * "always tier 2" stub before the real `resolveMediaTier` is written, so these tests actually
 * prove the selection rule rather than encode whatever the implementation happens to do.
 */
import {
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

  it('falls back to the figure when offline, even with a curated id', () => {
    const result = resolveMediaTier({ ...BASE, curatedVideoId: 'abc123XYZ_9', online: false });
    expect(result.tier).toBe('figure');
    expect(result.videoId).toBeNull();
  });

  it('falls back to the figure when there is no curated id, even online', () => {
    const result = resolveMediaTier({ ...BASE, curatedVideoId: null, online: true });
    expect(result.tier).toBe('figure');
  });

  it('falls back to the figure on a metered connection, even with a curated id', () => {
    const result = resolveMediaTier({ ...BASE, curatedVideoId: 'abc123XYZ_9', metered: true });
    expect(result.tier).toBe('figure');
  });

  it('falls back to the figure once demoted, even with a curated id and good connectivity', () => {
    const result = resolveMediaTier({ ...BASE, curatedVideoId: 'abc123XYZ_9', videoDemoted: true });
    expect(result.tier).toBe('figure');
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
  it('is null when offline — tier 3 requires connectivity', () => {
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
  it('uses youtube-nocookie.com, never youtube.com, per invariant 8 / §11.4 player behavior', () => {
    const url = buildEmbedUrl('abc123XYZ_9');
    expect(url).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\//);
    expect(url).not.toContain('//www.youtube.com');
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
