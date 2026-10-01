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
 * **Shape: one compact dark pill row, 44pt targets.** It sits directly under the progress bar,
 * above the exercise hero, and the hero is what §10.4 says must dominate this screen — so this
 * cannot grow into a player. It is four transport buttons and a line of text, and it never takes
 * more than one row plus an error line — the browse view below is a bottom `Sheet`, not a fifth
 * thing competing for room in that row. Spotify's green appears only as the brand dot.
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
import { ActivityIndicator, FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import {
  getContentChildren,
  getFitnessContent,
  playSpotifyContent,
  useSpotifyPlayer,
  type SpotifyContentItem,
} from '../lib/spotifyRemote';
import { makeStyles, radius, space, useTheme } from '../theme';
import { Icon, IconButton, PressableScale, Sheet, Txt } from '../ui';

/** One level of the browse stack: the items shown, and the label its header reads. The root level
 *  is always `'Workout picks'`; every level after that is named for whatever item was drilled into
 *  to reach it (a playlist folder's own title, say). */
interface BrowseLevel {
  title: string;
  items: SpotifyContentItem[];
}

export default function SpotifyControls(): React.JSX.Element | null {
  const styles = useStyles();
  const theme = useTheme();
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

  const { height } = useWindowDimensions();
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
    <Txt testID="spotify-error" variant="caption" color="text2" style={styles.error}>
      {lastError}
    </Txt>
  ) : null;

  if (connectionState !== 'connected') {
    const connecting = connectionState === 'connecting';
    return (
      <View testID="spotify-controls" style={styles.block}>
        <PressableScale
          testID="spotify-connect"
          accessibilityRole="button"
          accessibilityLabel="Connect Spotify"
          accessibilityState={{ disabled: connecting }}
          disabled={connecting}
          style={[styles.pill, styles.connectPill, connecting && styles.connectBusy]}
          onPress={connect}
        >
          <BrandDot />
          <Txt variant="bodyStrong" color="text" style={styles.connectText}>
            {connecting ? 'Connecting to Spotify…' : 'Connect Spotify'}
          </Txt>
        </PressableScale>
        {error}
      </View>
    );
  }

  return (
    <View testID="spotify-controls" style={styles.block}>
      <View style={[styles.pill, styles.row]}>
        <BrandDot />
        {/* Flexible and clipped rather than wrapping: a long title must not be allowed to push
            the transport buttons off the row or grow this block to two rows. */}
        <View style={styles.trackBox}>
          <Txt testID="spotify-track" variant="small" color="text" numberOfLines={1}>
            {track?.name ?? 'Connected to Spotify'}
          </Txt>
          {track != null && (
            <Txt testID="spotify-artist" variant="caption" color="text2" numberOfLines={1}>
              {track.artist}
            </Txt>
          )}
        </View>

        <IconButton
          testID="spotify-browse"
          icon="barbell"
          variant="plain"
          tone="text2"
          accessibilityLabel="Browse Spotify's workout picks"
          onPress={openBrowse}
        />
        <IconButton
          testID="spotify-previous"
          icon="previous"
          variant="plain"
          tone="text"
          accessibilityLabel="Previous track"
          disabled={!canSkipPrevious}
          onPress={skipPrevious}
        />
        <IconButton
          testID="spotify-play-pause"
          icon={isPlaying ? 'pause' : 'play'}
          tone="text"
          accessibilityLabel={isPlaying ? 'Pause Spotify' : 'Play Spotify'}
          onPress={togglePlay}
        />
        <IconButton
          testID="spotify-next"
          icon="skip"
          variant="plain"
          tone="text"
          accessibilityLabel="Next track"
          disabled={!canSkipNext}
          onPress={skipNext}
        />
      </View>
      {error}

      {/* The browse sheet — a name search over Spotify's public playlists, not the user's own
          library (the SDK has no way to list that; see the file header). */}
      <Sheet visible={browsing} onClose={closeBrowse} testID="spotify-browse-sheet">
        <View style={styles.browseHeader}>
          {browseStack.length > 1 ? (
            <IconButton
              testID="spotify-browse-back"
              icon="back"
              variant="plain"
              accessibilityLabel="Back"
              onPress={goBack}
            />
          ) : (
            <View style={styles.browseHeaderSpacer} />
          )}
          <Txt variant="h2" numberOfLines={1} style={styles.browseHeaderTitle}>
            {currentLevel?.title ?? 'Workout picks'}
          </Txt>
          <IconButton
            testID="spotify-browse-close"
            icon="close"
            variant="plain"
            accessibilityLabel="Close"
            onPress={closeBrowse}
          />
        </View>

        {browseError && (
          <Txt testID="spotify-browse-error" variant="caption" color="text2" style={styles.error}>
            {browseError}
          </Txt>
        )}

        {browseLoading ? (
          <View testID="spotify-browse-loading" accessibilityLabel="Loading" style={styles.empty}>
            <ActivityIndicator color={theme.colors.ember} />
          </View>
        ) : currentLevel && currentLevel.items.length === 0 && !browseError ? (
          <Txt variant="small" color="text2" style={styles.empty}>
            No workout picks available right now.
          </Txt>
        ) : (
          <FlatList
            data={currentLevel?.items ?? []}
            style={{ maxHeight: height * 0.55 }}
            keyExtractor={(item) => item.identifier}
            renderItem={({ item }) => (
              <View style={styles.browseRow}>
                <PressableScale
                  testID={`spotify-browse-item-${item.identifier}`}
                  style={styles.browseRowMain}
                  onPress={() => (item.isPlayable ? play(item) : drillIn(item))}
                >
                  <Txt variant="h3" numberOfLines={1}>
                    {item.title ?? 'Untitled'}
                  </Txt>
                  {item.subtitle && (
                    <Txt variant="caption" color="text2" numberOfLines={1}>
                      {item.subtitle}
                    </Txt>
                  )}
                </PressableScale>
                {/* Every search result is both playable and a container (a playlist, always),
                    so both actions need their own tap target — play it now, or look inside
                    first — rather than the chevron replacing the row's own. */}
                {item.isContainer && (
                  <IconButton
                    testID={`spotify-browse-drill-${item.identifier}`}
                    icon="chevronRight"
                    variant="plain"
                    tone="text2"
                    accessibilityLabel={`See inside ${item.title ?? 'this item'}`}
                    onPress={() => drillIn(item)}
                  />
                )}
              </View>
            )}
          />
        )}
      </Sheet>
    </View>
  );
}

/** Spotify's brand green, used only as the logo dot — the one place the color is about Spotify
 *  specifically (DESIGN.md §5.11). Everything else on the row is this app's own palette. */
const SPOTIFY_GREEN = '#1db954';

function BrandDot(): React.JSX.Element {
  const styles = useStyles();
  return (
    <View style={styles.brandDot}>
      <Icon name="music" size={14} color="fixedInk" />
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    block: { gap: space.xs },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.colors.surface,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: t.colors.line,
      paddingVertical: space.xs,
      paddingLeft: space.sm,
      paddingRight: space.xs,
    },
    row: { gap: space.xs },
    // flexShrink with a zero basis, not flex: 1 — the buttons are fixed-width and must win every
    // contest for space; this box takes exactly what is left.
    trackBox: { flexGrow: 1, flexShrink: 1, flexBasis: 0, marginLeft: space.xs },
    connectPill: { minHeight: 44, paddingRight: space.lg },
    connectBusy: { opacity: 0.6 },
    connectText: { marginLeft: space.md },
    brandDot: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: SPOTIFY_GREEN,
      alignItems: 'center',
      justifyContent: 'center',
    },
    error: { paddingHorizontal: space.sm },
    browseHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: space.sm },
    browseHeaderSpacer: { width: 44, height: 44 },
    browseHeaderTitle: { flex: 1, textAlign: 'center' },
    empty: { paddingVertical: space.lg },
    browseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 52,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.line,
    },
    browseRowMain: { flex: 1, paddingVertical: space.md },
  }),
);
