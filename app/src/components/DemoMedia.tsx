/**
 * §10.4/§11.4 the three-tier media ladder, rendered. Tier 2 (the bundled figure) is always the
 * floor and always what's mounted; the tier-1 embed is layered in front of it only when eligible,
 * never replacing the figure's availability. "Offline shows the figure with no dead player and no
 * error" (§11.2) falls out of this structure automatically: an offline/ineligible state simply
 * never mounts the `WebView` branch at all — there is no player object to error.
 *
 * Network status (online/metered) is read here, not passed in, so every call site gets the same
 * "safe until proven online" behavior from `networkStatus.ts` for free.
 *
 * Business logic this component does NOT own (kept in the screen, per this codebase's
 * `SwapSheet`-style convention of "components render, screens decide"):
 *   - Whether a curated video id exists at all (remote config — not built yet, track 6d).
 *   - Whether this exercise is locally demoted (`exerciseStateRepo.getVideoFlagState`).
 *   - Persisting a report or a player-error flag (`exerciseStateRepo.reportVideoIssue`) and the
 *     first-expansion signal (`sessionsRepo.recordDemoMediaExpanded`) — both are `@roamfit/store`
 *     calls the screen makes in the `onExpand`/`onReportIssue`/`onPlayerError` callbacks, per
 *     ADR 0003 / issue #13 ("no new persistence logic in app/").
 */
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { WebView } from 'react-native-webview';
import { buildEmbedUrl, buildSearchUrl, resolveMediaTier } from '../lib/mediaLadder';
import { getNetworkStatus } from '../lib/networkStatus';

export interface DemoMediaProps {
  figureSvg: string;
  videoSearchQuery: string;
  /** Remote-config value, or null — see file header. */
  curatedVideoId: string | null;
  /** Local two-report demotion state. */
  videoDemoted: boolean;
  /** Fires once, the first time this block is expanded open for this render. */
  onExpand: () => void;
  /** User tapped "this video is wrong or broken." */
  onReportIssue: () => void;
  /** The embedded player errored — falls back to the figure silently; this still records the
   *  automatic flag (§11.4 "the failure is reported back as an automatic flag"). */
  onPlayerError: () => void;
  defaultOpen: boolean;
}

export default function DemoMedia({
  figureSvg,
  videoSearchQuery,
  curatedVideoId,
  videoDemoted,
  onExpand,
  onReportIssue,
  onPlayerError,
  defaultOpen,
}: DemoMediaProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  // §11.4 "Player errors fall back to the figure silently" — once one fires for this mount, stay
  // on the figure even if the network status re-check would otherwise still favor the embed,
  // rather than flapping back to a player that just errored.
  const [playerErrored, setPlayerErrored] = useState(false);
  const [network, setNetwork] = useState<{ online: boolean; metered: boolean }>({
    online: false,
    metered: false,
  });

  useEffect(() => {
    let cancelled = false;
    getNetworkStatus().then((status) => {
      if (!cancelled) setNetwork(status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasExpandedOnce = React.useRef(false);
  useEffect(() => {
    if (open && !hasExpandedOnce.current) {
      hasExpandedOnce.current = true;
      onExpand();
    }
  }, [open, onExpand]);

  const ladder = resolveMediaTier({
    curatedVideoId,
    online: network.online,
    metered: network.metered,
    videoDemoted,
  });
  const showEmbed = ladder.tier === 'curated_embed' && ladder.videoId !== null && !playerErrored;
  const searchUrl = buildSearchUrl(videoSearchQuery, network.online);

  const handlePlayerError = () => {
    if (playerErrored) return; // §11.4: falls back silently — flag once per mount, not per retry.
    setPlayerErrored(true);
    onPlayerError();
  };

  const handleReport = () => {
    onReportIssue();
  };

  return (
    <View>
      <Pressable testID="demo-media-toggle" onPress={() => setOpen((o) => !o)}>
        <Text style={styles.title}>{open ? '▾' : '▸'} Demo</Text>
      </Pressable>

      {open && (
        <View style={styles.body} testID="demo-media-body">
          {!network.online && (
            <Text testID="demo-media-offline" style={styles.offlineIndicator}>
              Offline · showing figure
            </Text>
          )}

          <View style={styles.mediaFrame}>
            {showEmbed ? (
              <WebView
                testID="demo-media-webview"
                source={{ uri: buildEmbedUrl(ladder.videoId as string) }}
                style={styles.media}
                allowsFullscreenVideo={false}
                mediaPlaybackRequiresUserAction
                onError={handlePlayerError}
                onHttpError={handlePlayerError}
              />
            ) : (
              <SvgXml testID="demo-media-figure" xml={figureSvg} width="100%" height="100%" />
            )}
          </View>

          {showEmbed && (
            <Pressable testID="demo-media-report" onPress={handleReport}>
              <Text style={styles.reportLink}>This video is wrong or broken</Text>
            </Pressable>
          )}

          {searchUrl && (
            <Pressable testID="demo-media-search-link" onPress={() => Linking.openURL(searchUrl)}>
              <Text style={styles.searchLink}>Watch a real person do this ↗</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 14, fontWeight: '700', color: '#334155' },
  body: { gap: 8, marginTop: 8 },
  offlineIndicator: { fontSize: 12, color: '#94a3b8' },
  mediaFrame: {
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
    maxHeight: 220, // §10.4: "never takes more than about a third of the screen"
  },
  media: { flex: 1 },
  reportLink: { fontSize: 12, color: '#94a3b8', textDecorationLine: 'underline' },
  searchLink: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
});
