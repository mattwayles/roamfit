/**
 * §10.4/§11.4 the media ladder, rendered.
 *
 * **There is no bundled-figure tier any more (ADR 0008).** With connectivity this shows an embed
 * (the user's own assigned video, else the curated one) and/or the YouTube search link, plus the
 * ADR 0009 field for pasting a link to assign; with none it renders `null` and the screen's
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
 * the "components render, screens decide" convention):
 *   - Whether a curated video id exists at all (remote config).
 *   - Whether this exercise is locally demoted (`exerciseStateRepo.getVideoFlagState`).
 *   - Persisting a report or a player-error flag (`exerciseStateRepo.reportVideoIssue`) and the
 *     first-expansion signal (`sessionsRepo.recordDemoMediaExpanded`) — both are `@roamfit/store`
 *     calls the screen makes in the `onExpand`/`onReportIssue`/`onPlayerError` callbacks, per
 *     ADR 0003 / issue #13 ("no new persistence logic in app/").
 */
import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  EMBED_BASE_URL,
  buildEmbedHtml,
  buildSearchUrl,
  resolveMediaTier,
} from '../lib/mediaLadder';
import { getNetworkStatus } from '../lib/networkStatus';
import { parseYouTubeVideoId } from '../lib/youtubeUrl';

export interface DemoMediaProps {
  videoSearchQuery: string;
  /** ADR 0009 — the id the user has already assigned to this exercise, or null. */
  userVideoId: string | null;
  /** Called with a *parsed, validated* video id once the user submits a URL. The screen persists
   *  it (`exerciseStateRepo.assignUserVideo`) and re-reads, per "components render, screens
   *  decide" — this component never touches the store. */
  onAssignVideo: (videoId: string) => void;
  /** Called when the user clears their assignment. */
  onClearVideo: () => void;
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
  /** The URL field is the last thing on a long scrolling screen, so the software keyboard opens
   *  straight over it and the Save button beside it. The screen owns the scroll position (this
   *  component has no idea where it sits in the scroll view), so it gets told the field took
   *  focus and scrolls the block clear — "components render, screens decide", as above. */
  onInputFocus?: () => void;
}

export default function DemoMedia({
  videoSearchQuery,
  userVideoId,
  onAssignVideo,
  onClearVideo,
  curatedVideoId,
  videoDemoted,
  onExpand,
  onReportIssue,
  onPlayerError,
  defaultOpen,
  onInputFocus,
}: DemoMediaProps): React.JSX.Element | null {
  const [open, setOpen] = useState(defaultOpen);
  // §11.4 "Player errors fall back silently" — once one fires for this mount, stay off the embed
  // even if the network status re-check would otherwise still favor it, rather than flapping back
  // to a player that just errored.
  const [playerErrored, setPlayerErrored] = useState(false);
  const [draftUrl, setDraftUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
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
    userVideoId,
    curatedVideoId,
    online: network.online,
    metered: network.metered,
    videoDemoted,
  });
  // Both embed tiers render the same player; only the surrounding controls differ (see the
  // report link below). Keyed off `videoId` too so a tier/id drift can never mount a null src.
  const isEmbedTier = ladder.tier === 'user_embed' || ladder.tier === 'curated_embed';
  const showEmbed = isEmbedTier && ladder.videoId !== null && !playerErrored;
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

  const handleSubmitUrl = () => {
    const videoId = parseYouTubeVideoId(draftUrl);
    if (videoId === null) {
      // Neutral, specific, and non-punishing (invariant 4): says what the field wants, does not
      // scold. The draft is deliberately left in place so a near-miss paste can be fixed rather
      // than retyped.
      setUrlError('That doesn\u2019t look like a YouTube video link. Paste one and try again.');
      return;
    }
    setUrlError(null);
    setDraftUrl('');
    // A previous player error was about the *old* video. Clear it so the new assignment is
    // actually given a chance to render rather than being suppressed by a stale flag.
    setPlayerErrored(false);
    onAssignVideo(videoId);
  };

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
              {/* A host document, not the `/embed/` URL itself: pointed straight at the embed the
                  WebView *is* the page, so the player gets no referring page and refuses with
                  "Video player configuration error" (153) — and the document has to be same-site
                  with the player, or the next one along (152-4). See `EMBED_BASE_URL`. */}
              <WebView
                testID="demo-media-webview"
                source={{
                  html: buildEmbedHtml(ladder.videoId as string),
                  baseUrl: EMBED_BASE_URL,
                }}
                originWhitelist={['https://*']}
                style={styles.media}
                // The player reads its own configuration out of browser storage; a WebView with
                // storage turned off is the other half of the 152-4 configuration error.
                domStorageEnabled
                sharedCookiesEnabled
                allowsInlineMediaPlayback
                allowsFullscreenVideo={false}
                mediaPlaybackRequiresUserAction
                onError={handlePlayerError}
                onHttpError={handlePlayerError}
              />
            </View>
          )}

          {/* Reporting is for a *curated* video the user did not choose. For their own assignment
              the useful action is "replace it", offered below — flagging your own pick would feed
              the demotion counter that ADR 0009 deliberately exempts user videos from. */}
          {showEmbed && ladder.tier === 'curated_embed' && (
            <Pressable testID="demo-media-report" onPress={onReportIssue}>
              <Text style={styles.reportLink}>This video is wrong or broken</Text>
            </Pressable>
          )}

          {searchUrl && (
            <Pressable testID="demo-media-search-link" onPress={() => Linking.openURL(searchUrl)}>
              <Text style={styles.searchLink}>Watch a real person do this ↗</Text>
            </Pressable>
          )}

          {/* ADR 0009 — assign a video for this exercise. Sits with the search link because that
              is the flow: go find a good one, come back, paste it. Only shown when online, since
              that is the only time the link above it exists and the only time the result is
              immediately visible. */}
          <View style={styles.assignBlock} testID="demo-media-assign">
            <Text style={styles.assignLabel}>
              {userVideoId
                ? 'Replace this exercise’s video'
                : 'Use a specific video for this exercise'}
            </Text>
            <View style={styles.assignRow}>
              <TextInput
                testID="demo-media-url-input"
                style={styles.assignInput}
                value={draftUrl}
                onChangeText={(text) => {
                  setDraftUrl(text);
                  if (urlError) setUrlError(null);
                }}
                placeholder="Paste a YouTube link"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
                onSubmitEditing={handleSubmitUrl}
                onFocus={onInputFocus}
              />
              <Pressable
                testID="demo-media-url-save"
                style={[styles.assignButton, draftUrl.trim() === '' && styles.assignButtonDisabled]}
                disabled={draftUrl.trim() === ''}
                onPress={handleSubmitUrl}
              >
                <Text style={styles.assignButtonText}>Save</Text>
              </Pressable>
            </View>

            {urlError && (
              <Text testID="demo-media-url-error" style={styles.assignError}>
                {urlError}
              </Text>
            )}

            {userVideoId && (
              <Pressable testID="demo-media-url-clear" onPress={onClearVideo}>
                <Text style={styles.clearLink}>Remove my video for this exercise</Text>
              </Pressable>
            )}
          </View>
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
  assignBlock: { gap: 6, marginTop: 4 },
  assignLabel: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  assignRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  assignInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0f172a',
    minHeight: 44,
  },
  assignButton: {
    borderRadius: 10,
    paddingHorizontal: 16,
    backgroundColor: '#2563eb',
    minHeight: 44,
    justifyContent: 'center',
  },
  assignButtonDisabled: { backgroundColor: '#cbd5e1' },
  assignButtonText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  assignError: { fontSize: 12, color: '#b45309' },
  clearLink: { fontSize: 12, color: '#94a3b8', textDecorationLine: 'underline' },
  searchLink: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
});
