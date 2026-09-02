/**
 * §11.4 media ladder, rendered — proves the wiring (which branch mounts, which callbacks fire),
 * not real embed playback (the native module is Jest-mocked, see
 * `app/__mocks__/react-native-webview.js` and STATUS-6b-media-ladder.md).
 *
 * Since ADR 0008 removed the bundled figures, the fallback is *nothing rendered at all* — the
 * screen's "How to" cue is the offline demo. Several cases below therefore assert absence, which
 * is the actual product behavior: no dead player, no empty frame, no "unavailable" copy.
 *
 * `networkStatus.ts` is mocked per-test so each case can force online/offline/metered without
 * depending on Jest's real (always-offline) `expo-network` fallback — that fallback is already
 * covered by `networkStatus.test.ts`.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import DemoMedia from './DemoMedia';
import { getNetworkStatus } from '../lib/networkStatus';

jest.mock('../lib/networkStatus', () => ({
  getNetworkStatus: jest.fn(),
}));

const mockGetNetworkStatus = getNetworkStatus as jest.MockedFunction<typeof getNetworkStatus>;

async function renderOpen(props: Partial<React.ComponentProps<typeof DemoMedia>> = {}) {
  const onExpand = jest.fn();
  const onReportIssue = jest.fn();
  const onPlayerError = jest.fn();
  const onAssignVideo = jest.fn();
  const onClearVideo = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <DemoMedia
        videoSearchQuery="band row anchored to a door"
        curatedVideoId={null}
        userVideoId={null}
        videoDemoted={false}
        defaultOpen
        onExpand={onExpand}
        onReportIssue={onReportIssue}
        onPlayerError={onPlayerError}
        onAssignVideo={onAssignVideo}
        onClearVideo={onClearVideo}
        {...props}
      />,
    );
    await Promise.resolve();
  });
  return { renderer, onExpand, onReportIssue, onPlayerError, onAssignVideo, onClearVideo };
}

/** Type the URL field, then tap Save. */
async function submitUrl(renderer: TestRenderer.ReactTestRenderer, text: string) {
  const input = renderer.root.findByProps({ testID: 'demo-media-url-input' });
  await act(async () => {
    input.props.onChangeText(text);
  });
  const save = renderer.root.findByProps({ testID: 'demo-media-url-save' });
  await act(async () => {
    save.props.onPress();
  });
}

describe('DemoMedia', () => {
  beforeEach(() => {
    mockGetNetworkStatus.mockReset();
  });

  it('offline: renders nothing at all — no player, no frame, no toggle (the cue is the demo)', async () => {
    mockGetNetworkStatus.mockResolvedValue({ online: false, metered: false });
    const { renderer } = await renderOpen({ curatedVideoId: 'abc123XYZ_9' });
    expect(renderer.root.findAllByProps({ testID: 'demo-media-webview' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'demo-media-body' })).toHaveLength(0);
    // The whole disclosure is gone, not just its contents — there is nothing to open onto.
    expect(renderer.root.findAllByProps({ testID: 'demo-media-toggle' })).toHaveLength(0);
    expect(renderer.toJSON()).toBeNull();
  });

  it('online, no curated id: shows the search link and no player', async () => {
    mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
    const { renderer } = await renderOpen({ curatedVideoId: null });
    expect(renderer.root.findAllByProps({ testID: 'demo-media-webview' })).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'demo-media-search-link' })).toBeTruthy();
  });

  it('online, curated id, not demoted: shows the embed and the report control', async () => {
    mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
    const { renderer } = await renderOpen({ curatedVideoId: 'abc123XYZ_9' });
    expect(renderer.root.findAllByProps({ testID: 'demo-media-webview' }).length).toBeGreaterThan(
      0,
    );
    expect(renderer.root.findByProps({ testID: 'demo-media-report' })).toBeTruthy();
  });

  it('serves the player from a host document with a referring origin, never the bare embed URL', async () => {
    // Pointed straight at the /embed/ URL the WebView *is* the page, so the player has no
    // referring page and fails with "Video player configuration error" (153) on a real device.
    mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
    const { renderer } = await renderOpen({ curatedVideoId: 'abc123XYZ_9' });
    const webview = renderer.root.findByProps({ testID: 'demo-media-webview' });
    expect(webview.props.source.uri).toBeUndefined();
    expect(webview.props.source.html).toContain('<iframe');
    expect(webview.props.source.baseUrl).toBe('https://www.youtube.com');
    // ...and the frame is same-site with that page, or the player cannot reach its own storage
    // through WKWebView's partition and fails to configure anyway (error 152-4).
    expect(webview.props.source.html).toContain('src="https://www.youtube.com/embed/');
    // Storage has to be on for the same reason.
    expect(webview.props.domStorageEnabled).toBe(true);
  });

  it('online, curated id, but locally demoted: no embed, but the search link survives', async () => {
    mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
    const { renderer } = await renderOpen({ curatedVideoId: 'abc123XYZ_9', videoDemoted: true });
    expect(renderer.root.findAllByProps({ testID: 'demo-media-webview' })).toHaveLength(0);
    // Demotion removes the bad video, not the user's ability to go find a good one.
    expect(renderer.root.findByProps({ testID: 'demo-media-search-link' })).toBeTruthy();
  });

  it('metered connection: no embed even with a curated id, search link still offered', async () => {
    mockGetNetworkStatus.mockResolvedValue({ online: true, metered: true });
    const { renderer } = await renderOpen({ curatedVideoId: 'abc123XYZ_9' });
    expect(renderer.root.findAllByProps({ testID: 'demo-media-webview' })).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'demo-media-search-link' })).toBeTruthy();
  });

  it('a player error drops the embed silently and calls onPlayerError exactly once', async () => {
    mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
    const { renderer, onPlayerError } = await renderOpen({ curatedVideoId: 'abc123XYZ_9' });
    const webview = renderer.root.findByProps({ testID: 'demo-media-webview' });
    await act(async () => {
      webview.props.onError();
    });
    expect(onPlayerError).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByProps({ testID: 'demo-media-webview' })).toHaveLength(0);
    // No error UI of any kind — the fallback is silent (§11.2 "no error modals").
    expect(() => renderer.root.findByProps({ testID: /error/i })).toThrow();

    // A second pass with no webview mounted must not double-report.
    await act(async () => {});
    expect(onPlayerError).toHaveBeenCalledTimes(1);
  });

  describe('assigning your own video (ADR 0009)', () => {
    it('submitting a YouTube URL reports the parsed id, not the raw URL', async () => {
      // The store must never see a URL — that is what keeps a malformed paste away from the
      // player and keeps invariant 8's "no invented ids" checkable at one boundary.
      mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
      const { renderer, onAssignVideo } = await renderOpen();
      await submitUrl(renderer, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(onAssignVideo).toHaveBeenCalledWith('dQw4w9WgXcQ');
    });

    it('rejects a non-YouTube link inline and does not call onAssignVideo', async () => {
      mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
      const { renderer, onAssignVideo } = await renderOpen();
      await submitUrl(renderer, 'https://vimeo.com/123456789');
      expect(onAssignVideo).not.toHaveBeenCalled();
      expect(renderer.root.findByProps({ testID: 'demo-media-url-error' })).toBeTruthy();
    });

    it('keeps a rejected draft in the field so a near-miss can be fixed, not retyped', async () => {
      mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
      const { renderer } = await renderOpen();
      await submitUrl(renderer, 'https://vimeo.com/123456789');
      const input = renderer.root.findByProps({ testID: 'demo-media-url-input' });
      expect(input.props.value).toBe('https://vimeo.com/123456789');
    });

    it('clears the error as soon as the user edits the field again', async () => {
      mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
      const { renderer } = await renderOpen();
      await submitUrl(renderer, 'nonsense');
      expect(
        renderer.root.findAllByProps({ testID: 'demo-media-url-error' }).length,
      ).toBeGreaterThan(0);
      const input = renderer.root.findByProps({ testID: 'demo-media-url-input' });
      await act(async () => {
        input.props.onChangeText('https://youtu.be/dQw4w9WgXcQ');
      });
      expect(renderer.root.findAllByProps({ testID: 'demo-media-url-error' })).toHaveLength(0);
    });

    it('tells the screen when the field takes focus, so it can scroll clear of the keyboard', async () => {
      // The field is the last thing on the Workout screen, so the keyboard opens over it and its
      // Save button. The screen owns the scroll position; this component only reports the focus.
      mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
      const onInputFocus = jest.fn();
      const { renderer } = await renderOpen({ onInputFocus });
      const input = renderer.root.findByProps({ testID: 'demo-media-url-input' });
      await act(async () => {
        input.props.onFocus();
      });
      expect(onInputFocus).toHaveBeenCalledTimes(1);
    });

    it('empties the field after a successful submit', async () => {
      mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
      const { renderer } = await renderOpen();
      await submitUrl(renderer, 'https://youtu.be/dQw4w9WgXcQ');
      const input = renderer.root.findByProps({ testID: 'demo-media-url-input' });
      expect(input.props.value).toBe('');
    });

    it('embeds the user\u2019s video once assigned, in preference to the curated one', async () => {
      // This is the "immediately embedded" requirement, from the component's side: given the new
      // id as a prop, it renders that video rather than the curated id it also has.
      mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
      const { renderer } = await renderOpen({
        userVideoId: 'USERvid1234',
        curatedVideoId: 'abc123XYZ_9',
      });
      const webview = renderer.root.findByProps({ testID: 'demo-media-webview' });
      expect(webview.props.source.html).toContain('/embed/USERvid1234');
      expect(webview.props.source.html).not.toContain('abc123XYZ_9');
    });

    it('hides the "wrong or broken" report for the user\u2019s own pick', async () => {
      // Flagging your own choice would feed a demotion counter that ADR 0009 exempts user videos
      // from — a control that silently does nothing. Replacing it is the real action.
      mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
      const { renderer } = await renderOpen({ userVideoId: 'USERvid1234' });
      expect(renderer.root.findAllByProps({ testID: 'demo-media-report' })).toHaveLength(0);
      expect(renderer.root.findByProps({ testID: 'demo-media-url-clear' })).toBeTruthy();
    });

    it('still shows the report control for a curated video', async () => {
      mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
      const { renderer } = await renderOpen({ curatedVideoId: 'abc123XYZ_9' });
      expect(renderer.root.findByProps({ testID: 'demo-media-report' })).toBeTruthy();
    });

    it('offers no clear control when nothing is assigned', async () => {
      mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
      const { renderer } = await renderOpen({ userVideoId: null });
      expect(renderer.root.findAllByProps({ testID: 'demo-media-url-clear' })).toHaveLength(0);
    });

    it('tapping clear calls onClearVideo', async () => {
      mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
      const { renderer, onClearVideo } = await renderOpen({ userVideoId: 'USERvid1234' });
      const clear = renderer.root.findByProps({ testID: 'demo-media-url-clear' });
      await act(async () => {
        clear.props.onPress();
      });
      expect(onClearVideo).toHaveBeenCalledTimes(1);
    });

    it('disables Save while the field is empty', async () => {
      mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
      const { renderer } = await renderOpen();
      expect(renderer.root.findByProps({ testID: 'demo-media-url-save' }).props.disabled).toBe(
        true,
      );
    });

    it('is absent offline, along with the rest of the block', async () => {
      mockGetNetworkStatus.mockResolvedValue({ online: false, metered: false });
      const { renderer } = await renderOpen({ userVideoId: 'USERvid1234' });
      expect(renderer.root.findAllByProps({ testID: 'demo-media-assign' })).toHaveLength(0);
    });
  });

  it('tapping the report control calls onReportIssue', async () => {
    mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
    const { renderer, onReportIssue } = await renderOpen({ curatedVideoId: 'abc123XYZ_9' });
    const report = renderer.root.findByProps({ testID: 'demo-media-report' });
    act(() => {
      report.props.onPress();
    });
    expect(onReportIssue).toHaveBeenCalledTimes(1);
  });

  it('calls onExpand exactly once when opened, never again on subsequent re-renders', async () => {
    mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
    const { onExpand } = await renderOpen({ defaultOpen: true });
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('does not report an expansion when there was nothing to expand (offline)', async () => {
    // The §15 "media expanded" signal must mean the user actually saw media. Firing it for a
    // component that rendered nothing would silently corrupt the metric that decides which
    // exercises get self-filmed loops.
    mockGetNetworkStatus.mockResolvedValue({ online: false, metered: false });
    const { onExpand } = await renderOpen({ defaultOpen: true, curatedVideoId: 'abc123XYZ_9' });
    expect(onExpand).not.toHaveBeenCalled();
  });

  it('does not call onExpand when collapsed by default', async () => {
    mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
    const { onExpand } = await renderOpen({ defaultOpen: false });
    expect(onExpand).not.toHaveBeenCalled();
  });

  it('toggling open from collapsed calls onExpand', async () => {
    mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
    const { renderer, onExpand } = await renderOpen({ defaultOpen: false });
    const toggle = renderer.root.findByProps({ testID: 'demo-media-toggle' });
    await act(async () => {
      toggle.props.onPress();
      await Promise.resolve();
    });
    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});
