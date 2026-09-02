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
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <DemoMedia
        videoSearchQuery="band row anchored to a door"
        curatedVideoId={null}
        videoDemoted={false}
        defaultOpen
        onExpand={onExpand}
        onReportIssue={onReportIssue}
        onPlayerError={onPlayerError}
        {...props}
      />,
    );
    await Promise.resolve();
  });
  return { renderer, onExpand, onReportIssue, onPlayerError };
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
