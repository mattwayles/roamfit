/**
 * §11.4 media ladder, rendered — proves the wiring (which branch mounts, which callbacks fire),
 * not real SVG rasterization or real embed playback (both native modules are Jest-mocked, see
 * `app/__mocks__/react-native-svg.js` / `react-native-webview.js` and STATUS-6b-media-ladder.md).
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

const FIGURE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="1" cy="1" r="1"/></svg>';

async function renderOpen(props: Partial<React.ComponentProps<typeof DemoMedia>> = {}) {
  const onExpand = jest.fn();
  const onReportIssue = jest.fn();
  const onPlayerError = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <DemoMedia
        figureSvg={FIGURE_SVG}
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

  it('offline: shows the figure, a calm offline indicator, and no player at all', async () => {
    mockGetNetworkStatus.mockResolvedValue({ online: false, metered: false });
    const { renderer } = await renderOpen({ curatedVideoId: 'abc123XYZ_9' });
    expect(renderer.root.findAllByProps({ testID: 'demo-media-figure' }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ testID: 'demo-media-webview' })).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'demo-media-offline' })).toBeTruthy();
  });

  it('online, no curated id: shows the figure and the search link, no player', async () => {
    mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
    const { renderer } = await renderOpen({ curatedVideoId: null });
    expect(renderer.root.findAllByProps({ testID: 'demo-media-figure' }).length).toBeGreaterThan(0);
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

  it('online, curated id, but locally demoted: falls back to the figure, no embed', async () => {
    mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
    const { renderer } = await renderOpen({ curatedVideoId: 'abc123XYZ_9', videoDemoted: true });
    expect(renderer.root.findAllByProps({ testID: 'demo-media-webview' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'demo-media-figure' }).length).toBeGreaterThan(0);
  });

  it('metered connection: falls back to the figure even with a curated id', async () => {
    mockGetNetworkStatus.mockResolvedValue({ online: true, metered: true });
    const { renderer } = await renderOpen({ curatedVideoId: 'abc123XYZ_9' });
    expect(renderer.root.findAllByProps({ testID: 'demo-media-webview' })).toHaveLength(0);
  });

  it('a player error falls back to the figure silently and calls onPlayerError exactly once', async () => {
    mockGetNetworkStatus.mockResolvedValue({ online: true, metered: false });
    const { renderer, onPlayerError } = await renderOpen({ curatedVideoId: 'abc123XYZ_9' });
    const webview = renderer.root.findByProps({ testID: 'demo-media-webview' });
    await act(async () => {
      webview.props.onError();
    });
    expect(onPlayerError).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByProps({ testID: 'demo-media-webview' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'demo-media-figure' }).length).toBeGreaterThan(0);
    // No error UI of any kind — the fallback is silent (§11.2 "no error modals").
    expect(() => renderer.root.findByProps({ testID: /error/i })).toThrow();

    // A second error on what is now the figure (no webview mounted) must not double-report.
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
