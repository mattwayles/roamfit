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
 *
 * **Vibes, randomization, recents and favorites.** The first version of that search returned the
 * same generic (and heavily women-targeted) results on every open, so the sheet's root level now
 * opens with a row of vibe chips (`spotifyVibes.ts` — Rock, Metal, 90s, …). The selection is
 * multi-select, persisted to `users.spotify_vibes` the moment it changes, and re-runs the search;
 * 'Anything' and the genre chips are mutually exclusive, and nothing selected means 'Anything' so
 * a first open still shows results. `getFitnessContent` samples its queries at random, so the
 * refresh button next to "Fresh picks" re-rolls the same vibe into a different list. Below the
 * chips the root is a `SectionList`: **Favorites** (open by default — the deliberate keepers),
 * **Recently played** (collapsed, showing its count — the long tail that would otherwise push the
 * new picks off screen) and **Fresh picks**. Favorites and recents live in SQLite
 * (`spotifyPlaylistsRepo`), so they render even when the search fails offline; the search error
 * only replaces Fresh picks' body. They are also passed as `excludeIds`, so a saved playlist is
 * never offered again as "fresh". Playing a root-level playlist records it as played, and playing
 * a track from inside a playlist records that playlist (the item drilled into, kept on its
 * `BrowseLevel`), so the next open leads with what was actually used. The heart toggles a favorite
 * on any playlist row, in place.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  SectionList,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { spotifyPlaylistsRepo, usersRepo, type SavedSpotifyPlaylist } from '@roamfit/store';
import { nowUtcInstant } from '../lib/localClock';
import {
  getContentChildren,
  getFitnessContent,
  playSpotifyContent,
  useSpotifyPlayer,
  type SpotifyContentItem,
} from '../lib/spotifyRemote';
import { DEFAULT_VIBE_ID, SPOTIFY_VIBES, isKnownVibeId } from '../lib/spotifyVibes';
import { useStore } from '../state/StoreContext';
import { makeStyles, radius, space, useTheme } from '../theme';
import { Chip, Icon, IconButton, PressableScale, Sheet, Txt } from '../ui';

/** One level of the browse stack: the items shown, and the label its header reads. The root level
 *  is always `'Workout picks'`; every level after that is named for whatever item was drilled into
 *  to reach it (a playlist folder's own title, say). */
interface BrowseLevel {
  title: string;
  /** Unused on the root level — its rows come from the sections below. */
  items: SpotifyContentItem[];
  /** The item drilled into to reach this level. Playing a track here records it as played. */
  parent?: SpotifyContentItem;
}

type SectionKey = 'favorites' | 'recents' | 'fresh';

interface BrowseSection {
  key: SectionKey;
  title: string;
  data: SpotifyContentItem[];
  /** The full row count, which `data` drops to zero while the section is collapsed. */
  count: number;
}

interface FreshState {
  items: SpotifyContentItem[];
  error: string | null;
  loading: boolean;
}

/** A saved playlist as a browse row — playlists are always both playable and containers. */
function savedToItem(p: SavedSpotifyPlaylist): SpotifyContentItem {
  return {
    title: p.name,
    subtitle: p.owner,
    identifier: p.playlistId,
    uri: p.uri,
    isPlayable: true,
    isContainer: true,
  };
}

function identityOf(item: SpotifyContentItem) {
  return {
    playlistId: item.identifier,
    uri: item.uri,
    name: item.title ?? 'Untitled',
    owner: item.subtitle ?? null,
  };
}

/** Saved vibe ids minus anything this build doesn't know; empty falls back to 'anything'. */
function normalizeVibes(saved: string[]): string[] {
  const known = saved.filter(isKnownVibeId);
  return known.length > 0 ? known : [DEFAULT_VIBE_ID];
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
  const { db } = useStore();
  const [browseStack, setBrowseStack] = useState<BrowseLevel[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [vibes, setVibes] = useState<string[]>([DEFAULT_VIBE_ID]);
  const [favorites, setFavorites] = useState<SavedSpotifyPlaylist[]>([]);
  const [recents, setRecents] = useState<SavedSpotifyPlaylist[]>([]);
  const [fresh, setFresh] = useState<FreshState>({ items: [], error: null, loading: false });
  const [expanded, setExpanded] = useState({ favorites: true, recents: false });
  // Only the newest search may land: a chip tapped twice quickly must not let the slower first
  // answer overwrite the second.
  const searchSeq = useRef(0);
  const currentLevel = browseStack[browseStack.length - 1] ?? null;
  const browsing = browseStack.length > 0;
  const atRoot = browseStack.length === 1;

  const runSearch = useCallback(
    async (vibeIds: string[], favs: SavedSpotifyPlaylist[], recs: SavedSpotifyPlaylist[]) => {
      const seq = ++searchSeq.current;
      setFresh((f) => ({ ...f, loading: true, error: null }));
      const excludeIds = new Set([...favs, ...recs].map((p) => p.playlistId));
      const { items, error } = await getFitnessContent(vibeIds, { excludeIds });
      if (seq !== searchSeq.current) return;
      setFresh({ items: error ? [] : items, error, loading: false });
    },
    [],
  );

  const loadSaved = () => {
    const favs = spotifyPlaylistsRepo.listFavoritePlaylists(db);
    const recs = spotifyPlaylistsRepo.listRecentPlaylists(db);
    setFavorites(favs);
    setRecents(recs);
    return { favs, recs };
  };

  const openBrowse = async () => {
    setBrowseError(null);
    // Opens straight away: favorites and recents are local, so they are there before the search
    // (or without it, offline) — only Fresh picks waits on the network.
    setBrowseStack([{ title: 'Workout picks', items: [] }]);
    const chosen = normalizeVibes(usersRepo.getUser(db)?.spotifyVibes ?? []);
    setVibes(chosen);
    const { favs, recs } = loadSaved();
    await runSearch(chosen, favs, recs);
  };

  const toggleVibe = (id: string) => {
    let next: string[];
    if (id === DEFAULT_VIBE_ID) {
      next = [DEFAULT_VIBE_ID];
    } else if (vibes.includes(id)) {
      const rest = vibes.filter((v) => v !== id);
      next = rest.length > 0 ? rest : [DEFAULT_VIBE_ID];
    } else {
      next = [...vibes.filter((v) => v !== DEFAULT_VIBE_ID), id];
    }
    setVibes(next);
    usersRepo.updateUser(db, { spotifyVibes: next }, nowUtcInstant());
    void runSearch(next, favorites, recents);
  };

  const toggleFavorite = (item: SpotifyContentItem, favorite: boolean) => {
    spotifyPlaylistsRepo.setPlaylistFavorite(db, identityOf(item), favorite, new Date());
    loadSaved();
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
    setBrowseStack((stack) => [...stack, { title: item.title ?? 'Playlist', items, parent: item }]);
  };

  const play = async (item: SpotifyContentItem) => {
    setBrowseError(null);
    const error = await playSpotifyContent(item.uri);
    if (error) {
      setBrowseError(error);
      return;
    }
    // A root-level row is itself the playlist; a track inside a drilled-in playlist counts as
    // playing that playlist (the item drilled into, kept on the level).
    const played = atRoot ? item : currentLevel?.parent;
    if (played) {
      spotifyPlaylistsRepo.recordPlaylistPlayed(db, identityOf(played), new Date());
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

  const savedIds = new Set([...favorites, ...recents].map((p) => p.playlistId));
  const favoriteIds = new Set(favorites.map((p) => p.playlistId));
  // A pick that was just hearted or played now lives in a saved section; hide it here rather than
  // show it twice. Un-hearting a never-played pick deletes its row, so it reappears here.
  const freshItems = fresh.items.filter((i) => !savedIds.has(i.identifier));
  const sections: BrowseSection[] = [];
  if (favorites.length > 0) {
    sections.push({
      key: 'favorites',
      title: 'Favorites',
      count: favorites.length,
      data: expanded.favorites ? favorites.map(savedToItem) : [],
    });
  }
  if (recents.length > 0) {
    sections.push({
      key: 'recents',
      title: 'Recently played',
      count: recents.length,
      data: expanded.recents ? recents.map(savedToItem) : [],
    });
  }
  sections.push({ key: 'fresh', title: 'Fresh picks', count: freshItems.length, data: freshItems });

  // No native module: this feature does not exist in this build, so it does not exist on screen.
  if (!available) return null;

  const renderRow = (item: SpotifyContentItem, showHeart: boolean) => {
    const isFavorite = favoriteIds.has(item.identifier);
    const name = item.title ?? 'Untitled';
    return (
      <View style={styles.browseRow}>
        <PressableScale
          testID={`spotify-browse-item-${item.identifier}`}
          style={styles.browseRowMain}
          onPress={() => (item.isPlayable ? play(item) : drillIn(item))}
        >
          <Txt variant="h3" numberOfLines={1}>
            {name}
          </Txt>
          {item.subtitle && (
            <Txt variant="caption" color="text2" numberOfLines={1}>
              {item.subtitle}
            </Txt>
          )}
        </PressableScale>
        {showHeart && (
          <IconButton
            testID={`spotify-browse-favorite-${item.identifier}`}
            icon="heart"
            variant="plain"
            tone={isFavorite ? 'pine' : 'text2'}
            accessibilityLabel={isFavorite ? `Unfavorite ${name}` : `Favorite ${name}`}
            accessibilityState={{ selected: isFavorite }}
            onPress={() => toggleFavorite(item, !isFavorite)}
          />
        )}
        {/* Every search result is both playable and a container (a playlist, always),
            so both actions need their own tap target — play it now, or look inside
            first — rather than the chevron replacing the row's own. */}
        {item.isContainer && (
          <IconButton
            testID={`spotify-browse-drill-${item.identifier}`}
            icon="chevronRight"
            variant="plain"
            tone="text2"
            accessibilityLabel={`See inside ${name}`}
            onPress={() => drillIn(item)}
          />
        )}
      </View>
    );
  };

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

        {atRoot && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.vibeScroll}
            contentContainerStyle={styles.vibeRow}
            testID="spotify-vibes"
          >
            {SPOTIFY_VIBES.map((v) => (
              <Chip
                key={v.id}
                testID={`spotify-vibe-${v.id}`}
                label={v.label}
                tone="pine"
                selected={vibes.includes(v.id)}
                onPress={() => toggleVibe(v.id)}
              />
            ))}
          </ScrollView>
        )}

        {browseLoading ? (
          <View testID="spotify-browse-loading" accessibilityLabel="Loading" style={styles.empty}>
            <ActivityIndicator color={theme.colors.pine} />
          </View>
        ) : atRoot ? (
          <SectionList
            sections={sections}
            style={{ maxHeight: height * 0.55 }}
            keyExtractor={(item) => item.identifier}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => {
              if (section.key === 'fresh') {
                return (
                  <View style={styles.sectionHeader}>
                    <Txt variant="eyebrow" color="text2" style={styles.sectionTitle}>
                      {section.title}
                    </Txt>
                    <IconButton
                      testID="spotify-browse-refresh"
                      icon="refresh"
                      variant="plain"
                      tone="text2"
                      accessibilityLabel="Refresh picks"
                      disabled={fresh.loading}
                      onPress={() => void runSearch(vibes, favorites, recents)}
                    />
                  </View>
                );
              }
              const key = section.key as 'favorites' | 'recents';
              const isOpen = expanded[key];
              return (
                <PressableScale
                  testID={`spotify-browse-section-${key}`}
                  accessibilityRole="button"
                  accessibilityLabel={section.title}
                  accessibilityState={{ expanded: isOpen }}
                  style={styles.sectionHeader}
                  onPress={() => setExpanded((e) => ({ ...e, [key]: !e[key] }))}
                >
                  <Txt variant="eyebrow" color="text2" style={styles.sectionTitle}>
                    {`${section.title} · ${section.count}`}
                  </Txt>
                  <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={18} color="text2" />
                </PressableScale>
              );
            }}
            renderSectionFooter={({ section }) => {
              if (section.key !== 'fresh') return null;
              if (fresh.loading) {
                return (
                  <View
                    testID="spotify-browse-loading"
                    accessibilityLabel="Loading"
                    style={styles.empty}
                  >
                    <ActivityIndicator color={theme.colors.pine} />
                  </View>
                );
              }
              if (fresh.error) {
                return (
                  <Txt
                    testID="spotify-browse-search-error"
                    variant="caption"
                    color="text2"
                    style={styles.empty}
                  >
                    {fresh.error}
                  </Txt>
                );
              }
              if (freshItems.length === 0) {
                return (
                  <Txt variant="small" color="text2" style={styles.empty}>
                    No workout picks available right now.
                  </Txt>
                );
              }
              return null;
            }}
            renderItem={({ item }) => renderRow(item, true)}
          />
        ) : (
          <FlatList
            data={currentLevel?.items ?? []}
            style={{ maxHeight: height * 0.55 }}
            keyExtractor={(item) => item.identifier}
            renderItem={({ item }) => renderRow(item, false)}
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
    vibeScroll: { flexGrow: 0, marginBottom: space.sm },
    vibeRow: { gap: space.xs, paddingRight: space.md },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
      paddingTop: space.xs,
    },
    sectionTitle: { flex: 1 },
  }),
);
