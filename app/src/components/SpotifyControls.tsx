/**
 * Transport controls for whatever Spotify is playing, on the active workout screen. Asked for
 * directly: "so I don't have to swap between apps during a workout."
 *
 * All the reasoning about *how* this talks to Spotify lives in `../lib/spotifyRemote` — this file
 * only renders what that hook reports and calls back into it. Notably it never learns whether the
 * native module exists; `available` is just false, and the component returns `null`. A user with
 * no Spotify (or a build made before `expo prebuild` ran with a client ID) sees no trace of this
 * feature rather than a button that cannot work.
 *
 * **Shape: one row, 44pt targets.** It sits directly under the elapsed timer, above the exercise
 * hero, and the hero is what §10.4 says must dominate this screen — so this cannot grow into a
 * player. It is four transport buttons and a line of text, sized like the pause/mute/stop group it
 * sits beneath, and it never takes more than one row plus an error line — the browse sheet below is
 * a `Modal`, not a fifth thing competing for room in that row.
 *
 * **Why the whole thing is one tap away rather than always live.** Connecting can foreground the
 * Spotify app (see `connectSpotify` — waking a suspended Spotify is the ordinary path, not an
 * edge case), so this must never happen on mount. Mid-set is precisely the wrong moment to be
 * thrown into another app. The user taps once, at a moment of their choosing.
 *
 * **Skip buttons gate on Spotify's own restrictions**, not on our optimism: an advert, or some
 * radio contexts, genuinely cannot be skipped, and a button that silently does nothing is worse
 * than one that is visibly unavailable.
 *
 * **Browse: a name-filtered Spotify playlist search, then App Remote the rest of the way.** Asked
 * for directly — "am I able to choose songs or switch playlists" — and answered by what's actually
 * possible: App Remote has no search of its own, so `getFitnessContent` searches Spotify's Web API
 * for playlists by workout terms (the one place this feature needs our own network call — see that
 * function's header). Every row it returns is a real playlist, which is also a container of tracks,
 * so tapping the chevron previews them (`getContentChildren`) and tapping the row plays it
 * (`playSpotifyContent`) — both over App Remote, no further network call of ours either way.
 */
import React, { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  getContentChildren,
  getFitnessContent,
  playSpotifyContent,
  useSpotifyPlayer,
  type SpotifyContentItem,
} from '../lib/spotifyRemote';

/** One level of the browse stack: the items shown, and the label its header reads. The root level
 *  is always `'Workout picks'`; every level after that is named for whatever item was drilled into
 *  to reach it (a playlist folder's own title, say). */
interface BrowseLevel {
  title: string;
  items: SpotifyContentItem[];
}

export default function SpotifyControls(): React.JSX.Element | null {
  const {
    available,
    connectionState,
    track,
    isPlaying,
    canSkipNext,
    canSkipPrevious,
    lastError,
    connect,
    togglePlay,
    skipNext,
    skipPrevious,
  } = useSpotifyPlayer();

  const [browseStack, setBrowseStack] = useState<BrowseLevel[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const browsing = browseStack.length > 0;
  const currentLevel = browseStack[browseStack.length - 1] ?? null;

  const openBrowse = async () => {
    setBrowseError(null);
    setBrowseLoading(true);
    const { items, error } = await getFitnessContent();
    setBrowseLoading(false);
    if (error) {
      setBrowseError(error);
      // Opens anyway, with the error line showing — an empty modal that silently does nothing
      // would look like the tap was ignored.
      setBrowseStack([{ title: 'Workout picks', items: [] }]);
      return;
    }
    setBrowseStack([{ title: 'Workout picks', items }]);
  };

  const drillIn = async (item: SpotifyContentItem) => {
    setBrowseError(null);
    setBrowseLoading(true);
    const { items, error } = await getContentChildren(item);
    setBrowseLoading(false);
    if (error) {
      setBrowseError(error);
      return;
    }
    setBrowseStack((stack) => [...stack, { title: item.title ?? 'Playlist', items }]);
  };

  const play = async (item: SpotifyContentItem) => {
    setBrowseError(null);
    const error = await playSpotifyContent(item.uri);
    if (error) {
      setBrowseError(error);
      return;
    }
    // Picked something — the sheet has done its job. The track/artist line in the collapsed
    // controls below is what confirms it started.
    setBrowseStack([]);
  };

  const goBack = () => setBrowseStack((stack) => stack.slice(0, -1));
  const closeBrowse = () => {
    setBrowseStack([]);
    setBrowseError(null);
  };

  // No native module: this feature does not exist in this build, so it does not exist on screen.
  if (!available) return null;

  const error = lastError ? (
    <Text testID="spotify-error" style={styles.error}>
      {lastError}
    </Text>
  ) : null;

  if (connectionState !== 'connected') {
    const connecting = connectionState === 'connecting';
    return (
      <View testID="spotify-controls" style={styles.block}>
        <Pressable
          testID="spotify-connect"
          accessibilityRole="button"
          accessibilityLabel="Connect Spotify"
          accessibilityState={{ disabled: connecting }}
          disabled={connecting}
          style={[styles.connectButton, connecting && styles.connectButtonBusy]}
          onPress={connect}
        >
          <Text style={styles.connectText}>
            {connecting ? 'Connecting to Spotify…' : '♫  Connect Spotify'}
          </Text>
        </Pressable>
        {error}
      </View>
    );
  }

  return (
    <View testID="spotify-controls" style={styles.block}>
      <View style={styles.row}>
        {/* Flexible and clipped rather than wrapping: a long title must not be allowed to push
            the transport buttons off the row or grow this block to two rows. */}
        <View style={styles.trackBox}>
          <Text testID="spotify-track" style={styles.trackName} numberOfLines={1}>
            {track?.name ?? 'Connected to Spotify'}
          </Text>
          {track != null && (
            <Text testID="spotify-artist" style={styles.trackArtist} numberOfLines={1}>
              {track.artist}
            </Text>
          )}
        </View>

        <Pressable
          testID="spotify-browse"
          accessibilityRole="button"
          accessibilityLabel="Browse Spotify's workout picks"
          style={styles.iconButton}
          onPress={openBrowse}
        >
          <Text style={styles.iconText}>🏋</Text>
        </Pressable>

        <Pressable
          testID="spotify-previous"
          accessibilityRole="button"
          accessibilityLabel="Previous track"
          accessibilityState={{ disabled: !canSkipPrevious }}
          disabled={!canSkipPrevious}
          style={[styles.iconButton, !canSkipPrevious && styles.iconButtonDisabled]}
          onPress={skipPrevious}
        >
          <Text style={[styles.iconText, !canSkipPrevious && styles.iconTextDisabled]}>⏮</Text>
        </Pressable>

        <Pressable
          testID="spotify-play-pause"
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause Spotify' : 'Play Spotify'}
          style={[styles.iconButton, styles.playButton]}
          onPress={togglePlay}
        >
          <Text style={[styles.iconText, styles.playText]}>{isPlaying ? '❚❚' : '▶'}</Text>
        </Pressable>

        <Pressable
          testID="spotify-next"
          accessibilityRole="button"
          accessibilityLabel="Next track"
          accessibilityState={{ disabled: !canSkipNext }}
          disabled={!canSkipNext}
          style={[styles.iconButton, !canSkipNext && styles.iconButtonDisabled]}
          onPress={skipNext}
        >
          <Text style={[styles.iconText, !canSkipNext && styles.iconTextDisabled]}>⏭</Text>
        </Pressable>
      </View>
      {error}

      {/* The browse sheet — a name search over Spotify's public playlists, not the user's own
          library (the SDK has no way to list that; see the file header). Same dismissing-backdrop-
          behind-a-tap-swallowing-dialog shape `WorkoutScreen`'s day-marker popup uses. */}
      <Modal visible={browsing} transparent animationType="fade" onRequestClose={closeBrowse}>
        <Pressable style={styles.browseBackdrop} onPress={closeBrowse}>
          <Pressable style={styles.browseDialog} onPress={() => {}}>
            <View style={styles.browseHeader}>
              {browseStack.length > 1 ? (
                <Pressable
                  testID="spotify-browse-back"
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  onPress={goBack}
                  hitSlop={8}
                >
                  <Text style={styles.browseHeaderChevron}>‹</Text>
                </Pressable>
              ) : (
                <View style={styles.browseHeaderChevronSpacer} />
              )}
              <Text style={styles.browseHeaderTitle} numberOfLines={1}>
                {currentLevel?.title ?? 'Workout picks'}
              </Text>
              <Pressable
                testID="spotify-browse-close"
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={closeBrowse}
                hitSlop={8}
              >
                <Text style={styles.browseHeaderClose}>×</Text>
              </Pressable>
            </View>

            {browseError && (
              <Text testID="spotify-browse-error" style={styles.error}>
                {browseError}
              </Text>
            )}

            {browseLoading ? (
              <Text testID="spotify-browse-loading" style={styles.browseEmptyText}>
                Loading…
              </Text>
            ) : currentLevel && currentLevel.items.length === 0 && !browseError ? (
              <Text style={styles.browseEmptyText}>No workout picks available right now.</Text>
            ) : (
              <FlatList
                data={currentLevel?.items ?? []}
                keyExtractor={(item) => item.identifier}
                renderItem={({ item }) => (
                  <View style={styles.browseRow}>
                    <Pressable
                      testID={`spotify-browse-item-${item.identifier}`}
                      style={styles.browseRowMain}
                      onPress={() => (item.isPlayable ? play(item) : drillIn(item))}
                    >
                      <Text style={styles.browseRowTitle} numberOfLines={1}>
                        {item.title ?? 'Untitled'}
                      </Text>
                      {item.subtitle && (
                        <Text style={styles.browseRowSubtitle} numberOfLines={1}>
                          {item.subtitle}
                        </Text>
                      )}
                    </Pressable>
                    {/* Every search result is both playable and a container (a playlist, always),
                        so both actions need their own tap target — play it now, or look inside
                        first — rather than the chevron replacing the row's own. */}
                    {item.isContainer && (
                      <Pressable
                        testID={`spotify-browse-drill-${item.identifier}`}
                        accessibilityRole="button"
                        accessibilityLabel={`See inside ${item.title ?? 'this item'}`}
                        style={styles.browseRowChevronButton}
                        onPress={() => drillIn(item)}
                        hitSlop={8}
                      >
                        <Text style={styles.browseHeaderChevron}>›</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Spotify's brand green, used only as an accent on the two controls that are about Spotify
 *  specifically (connect, and play/pause). The rest of the row stays in this screen's slate
 *  palette — the exercise is the subject of this page, not the music. */
const SPOTIFY_GREEN = '#1db954';

const styles = StyleSheet.create({
  block: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // flexShrink with a zero basis, not flex: 1 — the buttons are fixed-width and must win every
  // contest for space; this box takes exactly what is left.
  trackBox: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  trackName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  trackArtist: { fontSize: 12, color: '#64748b' },
  connectButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SPOTIFY_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  connectButtonBusy: { borderColor: '#cbd5e1' },
  connectText: { fontSize: 14, fontWeight: '700', color: '#166534' },
  // Same 44pt footprint as the session icon buttons on the timer row above, so the two groups
  // read as one control area rather than two competing ones.
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 16, fontWeight: '800', color: '#334155', lineHeight: 20 },
  playButton: { backgroundColor: SPOTIFY_GREEN },
  playText: { color: '#fff' },
  // Visibly unavailable rather than absent: nothing shifts under a thumb already reaching for it
  // when an advert ends and skipping becomes possible again.
  iconButtonDisabled: { backgroundColor: '#f1f5f9' },
  iconTextDisabled: { color: '#cbd5e1' },
  error: { fontSize: 12, color: '#64748b' },
  browseBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  browseDialog: {
    maxHeight: '70%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
    paddingBottom: 24,
    paddingHorizontal: 16,
  },
  browseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
  },
  browseHeaderChevron: { fontSize: 22, fontWeight: '700', color: '#334155', width: 24 },
  browseHeaderChevronSpacer: { width: 24 },
  browseHeaderTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#0f172a' },
  browseHeaderClose: { fontSize: 20, fontWeight: '700', color: '#64748b', width: 24 },
  browseEmptyText: { fontSize: 13, color: '#64748b', paddingVertical: 16 },
  browseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  browseRowMain: { flex: 1, paddingVertical: 8 },
  browseRowTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  browseRowSubtitle: { fontSize: 12, color: '#64748b' },
  browseRowChevronButton: { paddingLeft: 8 },
});
