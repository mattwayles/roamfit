/**
 * §10.4/§11.4 the media ladder, rendered.
 *
 * **There is no bundled-figure tier any more (ADR 0008).** With connectivity this shows the
 * curated embed and/or the YouTube search link; with none it renders `null` and the screen's
 * "How to" cue block carries the demonstration on its own. That is why this component returns
 * nothing rather than an empty frame or a placeholder: an offline user gets no dead player, no
 * broken-image box, and no "unavailable" copy to feel punished by (invariant 4) — just the cue,
 * which is the thing that actually teaches the movement.
 *
 * §11.6's airplane-mode gate is unaffected: the cue text is bundled on the exercise record, so
 * the offline path still has real content and never depends on a network read.
 *
 * Network status (online/metered) is read here, not passed in, so every call site gets the same
 * "safe until proven online" behavior from `networkStatus.ts` for free.
 *
 * Business logic this component does NOT own (kept in the screen, per this codebase's
 * `SwapSheet`-style convention of "components render, screens decide"):
 *   - Whether a curated video id exists at all (remote config).
 *   - Whether this exercise is locally demoted (`exerciseStateRepo.getVideoFlagState`).
 *   - Persisting a report or a player-error flag (`exerciseStateRepo.reportVideoIssue`) and the
 *     first-expansion signal (`sessionsRepo.recordDemoMediaExpanded`) — both are `@roamfit/store`
 *     calls the screen makes in the `onExpand`/`onReportIssue`/`onPlayerError` callbacks, per
 *     ADR 0003 / issue #13 ("no new persistence logic in app/").
 */
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildEmbedUrl, buildSearchUrl, resolveMediaTier } from '../lib/mediaLadder';
import { getNetworkStatus } from '../lib/networkStatus';

export interface DemoMediaProps {
  videoSearchQuery: string;
  /** Remote-config value, or null — see file header. */
  curatedVideoId: string | null;
  /** Local two-report demotion state. */
  videoDemoted: boolean;
  /** Fires once, the first time this block is expanded open for this render. */
  onExpand: () => void;
  /** User tapped "this video is wrong or broken." */
  onReportIssue: () => void;
  /** The embedded player errored — the embed is dropped silently; this still records the
   *  automatic flag (§11.4 "the failure is reported back as an automatic flag"). */
  onPlayerError: () => void;
  defaultOpen: boolean;
}

export default function DemoMedia({
  videoSearchQuery,
  curatedVideoId,
  videoDemoted,
  onExpand,
  onReportIssue,
  onPlayerError,
  defaultOpen,
}: DemoMediaProps): React.JSX.Element | null {
  const [open, setOpen] = useState(defaultOpen);
  // §11.4 "Player errors fall back silently" — once one fires for this mount, stay off the embed
  // even if the network status re-check would otherwise still favor it, rather than flapping back
  // to a player that just errored.
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

  const ladder = resolveMediaTier({
    curatedVideoId,
    online: network.online,
    metered: network.metered,
    videoDemoted,
  });
  const showEmbed = ladder.tier === 'curated_embed' && ladder.videoId !== null && !playerErrored;
  const searchUrl = buildSearchUrl(videoSearchQuery, network.online);
  const hasAnything = showEmbed || searchUrl !== null;

  // Declared before the early return so the hook order is stable across the offline/online
  // transition — `network` starts pessimistic and flips once `getNetworkStatus()` resolves, so
  // this component genuinely does re-render from "nothing to show" to "embed".
  const hasExpandedOnce = React.useRef(false);
  useEffect(() => {
    if (open && hasAnything && !hasExpandedOnce.current) {
      hasExpandedOnce.current = true;
      onExpand();
    }
  }, [open, hasAnything, onExpand]);

  // Nothing to offer: no embed, no search link. Render nothing at all rather than an empty
  // disclosure the user can open onto a blank frame — the "How to" cue below it is the demo.
  if (!hasAnything) return null;

  const handlePlayerError = () => {
    if (playerErrored) return; // §11.4: falls back silently — flag once per mount, not per retry.
    setPlayerErrored(true);
    onPlayerError();
  };

  return (
    <View>
      <Pressable testID="demo-media-toggle" onPress={() => setOpen((o) => !o)}>
        <Text style={styles.title}>{open ? '▾' : '▸'} Demo</Text>
      </Pressable>

      {open && (
        <View style={styles.body} testID="demo-media-body">
          {showEmbed && (
            <View style={styles.mediaFrame}>
              <WebView
                testID="demo-media-webview"
                source={{ uri: buildEmbedUrl(ladder.videoId as string) }}
                style={styles.media}
                allowsFullscreenVideo={false}
                mediaPlaybackRequiresUserAction
                onError={handlePlayerError}
                onHttpError={handlePlayerError}
              />
            </View>
          )}

          {showEmbed && (
            <Pressable testID="demo-media-report" onPress={onReportIssue}>
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
