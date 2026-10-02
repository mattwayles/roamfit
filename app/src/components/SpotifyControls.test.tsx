/**
 * The transport bar as a control. `../lib/spotifyRemote` is mocked wholesale — it is the seam
 * `useSpotifyPlayer` was written to be — so these cases drive the component through every state
 * the real hook can report, including the ones that are awkward to reach on a device (no native
 * module, an unskippable advert, a dropped connection mid-set).
 *
 * Note for anyone adding cases here: every case **awaits both `render` and `fireEvent`**, which is
 * not what the older component suites in this directory do. Under React 19 / RNTL 14 both are
 * genuinely async (so are `rerender` and RNTL's own auto-cleanup), and the un-awaited
 * `render(...)` + `await waitFor(...)` shape those files use survives only while a file never
 * needs a return value and never fires more than a press or two. Leaving either un-awaited here
 * left an act() scope open across the test boundary, and the symptom lands on the *next* test:
 * cases that pass alone fail in sequence, by timeout or by "unable to find an element", pointing
 * at a component that is fine. The trigger was three un-awaited presses one case earlier.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { schema, spotifyPlaylistsRepo, usersRepo } from '@roamfit/store';
import type { Db } from '@roamfit/store';
import SpotifyControls from './SpotifyControls';
import { StoreProvider, useStore } from '../state/StoreContext';
import {
  useSpotifyPlayer,
  getFitnessContent,
  getContentChildren,
  playSpotifyContent,
} from '../lib/spotifyRemote';
import type { SpotifyContentItem, SpotifyPlayer } from '../lib/spotifyRemote';

jest.mock('../lib/spotifyRemote', () => ({
  useSpotifyPlayer: jest.fn(),
  getFitnessContent: jest.fn(),
  getContentChildren: jest.fn(),
  playSpotifyContent: jest.fn(),
}));

const mockedHook = useSpotifyPlayer as jest.MockedFunction<typeof useSpotifyPlayer>;
const mockedGetFitnessContent = getFitnessContent as jest.MockedFunction<typeof getFitnessContent>;
const mockedGetContentChildren = getContentChildren as jest.MockedFunction<
  typeof getContentChildren
>;
const mockedPlaySpotifyContent = playSpotifyContent as jest.MockedFunction<
  typeof playSpotifyContent
>;

function contentItem(over: Partial<SpotifyContentItem> = {}): SpotifyContentItem {
  return {
    title: 'Power Hour',
    subtitle: 'Workout Mix',
    identifier: 'item-1',
    uri: 'spotify:playlist:abc123',
    isPlayable: true,
    isContainer: false,
    ...over,
  };
}

const actions = {
  connect: jest.fn(),
  togglePlay: jest.fn(),
  skipNext: jest.fn(),
  skipPrevious: jest.fn(),
  clearError: jest.fn(),
};

function player(over: Partial<SpotifyPlayer> = {}): SpotifyPlayer {
  return {
    available: true,
    connectionState: 'connected',
    track: { name: 'Bad Habit', artist: 'Steve Lacy' },
    isPlaying: true,
    canSkipNext: true,
    canSkipPrevious: true,
    lastError: null,
    ...actions,
    ...over,
  };
}

// The real on-device store (one db per test file, see `app/jest.config.js`), because favorites and
// recents are what this component is partly *for* — a mocked repo would only prove the mock.
let testDb: Db | null = null;

function DbProbe(): null {
  testDb = useStore().db;
  return null;
}

const tree = () => (
  <StoreProvider>
    <DbProbe />
    <SpotifyControls />
  </StoreProvider>
);

async function renderControls() {
  await render(tree());
  return testDb!;
}

function saved(id: string, name = `Playlist ${id}`) {
  return { playlistId: id, uri: `spotify:playlist:${id}`, name, owner: 'Someone' };
}

beforeEach(() => {
  jest.clearAllMocks();
  if (testDb) {
    testDb.delete(schema.spotifyPlaylists).run();
    usersRepo.updateUser(testDb, { spotifyVibes: [] }, new Date().toISOString());
  }
  mockedGetFitnessContent.mockResolvedValue({ items: [contentItem()], error: null });
  mockedGetContentChildren.mockResolvedValue({ items: [], error: null });
  mockedPlaySpotifyContent.mockResolvedValue(null);
});

describe('SpotifyControls', () => {
  it('renders nothing at all when there is no native module', async () => {
    // Not a disabled row and not an explanation — a build without Spotify should look like a
    // build that never had it.
    mockedHook.mockReturnValue(player({ available: false, connectionState: 'unavailable' }));
    await renderControls();

    expect(screen.queryByTestId('spotify-controls')).toBeNull();
  });

  it('offers a single tap to connect before anything is connected', async () => {
    mockedHook.mockReturnValue(player({ connectionState: 'disconnected', track: null }));
    await renderControls();

    // No transport controls yet — there is nothing to control.
    expect(screen.queryByTestId('spotify-play-pause')).toBeNull();

    await fireEvent.press(screen.getByTestId('spotify-connect'));
    expect(actions.connect).toHaveBeenCalled();
  });

  it('will not let the connect button be pressed twice while the auth bounce is in flight', async () => {
    mockedHook.mockReturnValue(player({ connectionState: 'connecting', track: null }));
    await renderControls();

    expect(screen.getByTestId('spotify-connect').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('spotify-connect'));
    expect(actions.connect).not.toHaveBeenCalled();
  });

  it('shows what is playing once connected', async () => {
    mockedHook.mockReturnValue(player());
    await renderControls();

    expect(screen.getByTestId('spotify-track').props.children).toBe('Bad Habit');
    expect(screen.getByTestId('spotify-artist').props.children).toBe('Steve Lacy');
    expect(screen.queryByTestId('spotify-connect')).toBeNull();
  });

  it('stays a one-line row when a title is long enough to wrap', async () => {
    mockedHook.mockReturnValue(
      player({
        track: {
          name: 'Everything In Its Right Place (Gigamesh Extended Remix) - Remastered',
          artist: 'A Very Long Artist Name Indeed',
        },
      }),
    );
    await renderControls();

    // Clipped, not wrapped: a second line would push the exercise hero down the screen.
    expect(screen.getByTestId('spotify-track').props.numberOfLines).toBe(1);
    expect(screen.getByTestId('spotify-artist').props.numberOfLines).toBe(1);
  });

  it('says it is connected before Spotify has reported a track', async () => {
    mockedHook.mockReturnValue(player({ track: null }));
    await renderControls();

    expect(screen.getByTestId('spotify-track').props.children).toBe('Connected to Spotify');
    expect(screen.queryByTestId('spotify-artist')).toBeNull();
    // The transport is still offered — resume is exactly what you want when nothing is playing.
    expect(screen.getByTestId('spotify-play-pause')).toBeTruthy();
  });

  it('drives each transport control', async () => {
    mockedHook.mockReturnValue(player());
    await renderControls();

    await fireEvent.press(screen.getByTestId('spotify-previous'));
    await fireEvent.press(screen.getByTestId('spotify-play-pause'));
    await fireEvent.press(screen.getByTestId('spotify-next'));

    expect(actions.skipPrevious).toHaveBeenCalledTimes(1);
    expect(actions.togglePlay).toHaveBeenCalledTimes(1);
    expect(actions.skipNext).toHaveBeenCalledTimes(1);
  });

  it('labels play/pause for what the press will do, in both directions', async () => {
    mockedHook.mockReturnValue(player({ isPlaying: true }));
    const { rerender } = await render(tree());
    expect(screen.getByLabelText('Pause Spotify')).toBeTruthy();

    mockedHook.mockReturnValue(player({ isPlaying: false }));
    await rerender(tree());
    expect(screen.getByLabelText('Play Spotify')).toBeTruthy();
  });

  it('disables a skip Spotify itself refuses, rather than letting it do nothing', async () => {
    // What an advert looks like from here.
    mockedHook.mockReturnValue(player({ canSkipNext: false, canSkipPrevious: false }));
    await renderControls();

    expect(screen.getByTestId('spotify-next').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('spotify-previous').props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(screen.getByTestId('spotify-next'));
    await fireEvent.press(screen.getByTestId('spotify-previous'));
    expect(actions.skipNext).not.toHaveBeenCalled();
    expect(actions.skipPrevious).not.toHaveBeenCalled();

    // Play/pause is not restricted by the same thing and must stay usable.
    expect(screen.getByTestId('spotify-play-pause').props.accessibilityState?.disabled).toBeFalsy();
  });

  it('says why, instead of looking broken', async () => {
    mockedHook.mockReturnValue(
      player({
        connectionState: 'disconnected',
        track: null,
        lastError: 'Spotify Premium is needed to control playback.',
      }),
    );
    await renderControls();

    expect(screen.getByTestId('spotify-error').props.children).toBe(
      'Spotify Premium is needed to control playback.',
    );
  });

  it('shows an error that arrives while connected without dropping the transport', async () => {
    mockedHook.mockReturnValue(player({ lastError: 'Couldn’t reach the Spotify app.' }));
    await renderControls();

    expect(screen.getByTestId('spotify-error')).toBeTruthy();
    expect(screen.getByTestId('spotify-play-pause')).toBeTruthy();
  });
});

describe('SpotifyControls browse sheet — Spotify\'s curated "fitness" feed', () => {
  it('loads the fitness feed and shows it the moment the browse button is pressed', async () => {
    mockedGetFitnessContent.mockResolvedValue({
      items: [contentItem({ identifier: 'a', title: 'Power Hour' })],
      error: null,
    });
    mockedHook.mockReturnValue(player());
    await renderControls();

    await fireEvent.press(screen.getByTestId('spotify-browse'));

    expect(mockedGetFitnessContent).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('spotify-browse-item-a')).toBeTruthy());
    expect(screen.getByText('Power Hour')).toBeTruthy();
    expect(screen.getByText('Workout Mix')).toBeTruthy();
  });

  it('says so when Spotify has nothing to offer, rather than showing an empty sheet', async () => {
    mockedGetFitnessContent.mockResolvedValue({ items: [], error: null });
    mockedHook.mockReturnValue(player());
    await renderControls();

    await fireEvent.press(screen.getByTestId('spotify-browse'));

    await waitFor(() =>
      expect(screen.getByText('No workout picks available right now.')).toBeTruthy(),
    );
  });

  it('plays a playable item on tap and closes the sheet', async () => {
    mockedGetFitnessContent.mockResolvedValue({
      items: [contentItem({ identifier: 'a', isPlayable: true, isContainer: false })],
      error: null,
    });
    mockedHook.mockReturnValue(player());
    await renderControls();
    await fireEvent.press(screen.getByTestId('spotify-browse'));
    await waitFor(() => expect(screen.getByTestId('spotify-browse-item-a')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('spotify-browse-item-a'));

    expect(mockedPlaySpotifyContent).toHaveBeenCalledWith('spotify:playlist:abc123');
    await waitFor(() => expect(screen.queryByTestId('spotify-browse-item-a')).toBeNull());
  });

  it('drills into a container on tap when it cannot be played directly', async () => {
    mockedGetFitnessContent.mockResolvedValue({
      items: [
        contentItem({
          identifier: 'folder',
          title: 'Cardio',
          isPlayable: false,
          isContainer: true,
        }),
      ],
      error: null,
    });
    mockedGetContentChildren.mockResolvedValue({
      items: [contentItem({ identifier: 'child', title: 'Sprint Mix' })],
      error: null,
    });
    mockedHook.mockReturnValue(player());
    await renderControls();
    await fireEvent.press(screen.getByTestId('spotify-browse'));
    await waitFor(() => expect(screen.getByTestId('spotify-browse-item-folder')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('spotify-browse-item-folder'));

    expect(mockedGetContentChildren).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'folder' }),
    );
    await waitFor(() => expect(screen.getByTestId('spotify-browse-item-child')).toBeTruthy());
    expect(screen.getByText('Sprint Mix')).toBeTruthy();
  });

  it('offers a separate "see inside" tap for an item that is both playable and a container', async () => {
    mockedGetFitnessContent.mockResolvedValue({
      items: [
        contentItem({
          identifier: 'playlist',
          title: 'Power Hour',
          isPlayable: true,
          isContainer: true,
        }),
      ],
      error: null,
    });
    mockedGetContentChildren.mockResolvedValue({
      items: [contentItem({ identifier: 'track-1', title: 'Track One' })],
      error: null,
    });
    mockedHook.mockReturnValue(player());
    await renderControls();
    await fireEvent.press(screen.getByTestId('spotify-browse'));
    await waitFor(() => expect(screen.getByTestId('spotify-browse-item-playlist')).toBeTruthy());

    // The row itself plays (the more common intent for something both playable and browsable)...
    await fireEvent.press(screen.getByTestId('spotify-browse-item-playlist'));
    expect(mockedPlaySpotifyContent).toHaveBeenCalledWith('spotify:playlist:abc123');
    expect(mockedGetContentChildren).not.toHaveBeenCalled();
  });

  it('a container also playable still offers its own drill-in chevron', async () => {
    mockedGetFitnessContent.mockResolvedValue({
      items: [
        contentItem({
          identifier: 'playlist',
          title: 'Power Hour',
          isPlayable: true,
          isContainer: true,
        }),
      ],
      error: null,
    });
    mockedGetContentChildren.mockResolvedValue({
      items: [contentItem({ identifier: 'track-1', title: 'Track One' })],
      error: null,
    });
    mockedHook.mockReturnValue(player());
    await renderControls();
    await fireEvent.press(screen.getByTestId('spotify-browse'));
    await waitFor(() => expect(screen.getByTestId('spotify-browse-drill-playlist')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('spotify-browse-drill-playlist'));

    await waitFor(() => expect(screen.getByTestId('spotify-browse-item-track-1')).toBeTruthy());
    expect(mockedPlaySpotifyContent).not.toHaveBeenCalled();
  });

  it('walks back up one level at a time rather than straight to the root', async () => {
    mockedGetFitnessContent.mockResolvedValue({
      items: [
        contentItem({
          identifier: 'folder',
          title: 'Cardio',
          isPlayable: false,
          isContainer: true,
        }),
      ],
      error: null,
    });
    mockedGetContentChildren.mockResolvedValue({
      items: [contentItem({ identifier: 'child', title: 'Sprint Mix' })],
      error: null,
    });
    mockedHook.mockReturnValue(player());
    await renderControls();
    await fireEvent.press(screen.getByTestId('spotify-browse'));
    await waitFor(() => expect(screen.getByTestId('spotify-browse-item-folder')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('spotify-browse-item-folder'));
    await waitFor(() => expect(screen.getByTestId('spotify-browse-item-child')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('spotify-browse-back'));

    await waitFor(() => expect(screen.getByTestId('spotify-browse-item-folder')).toBeTruthy());
    expect(screen.queryByTestId('spotify-browse-item-child')).toBeNull();
  });

  it('closes on the × without needing to walk back through every level first', async () => {
    mockedHook.mockReturnValue(player());
    await renderControls();
    await fireEvent.press(screen.getByTestId('spotify-browse'));
    await waitFor(() => expect(screen.getByTestId('spotify-browse-close')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('spotify-browse-close'));

    // The sheet animates out before it unmounts.
    await waitFor(() => expect(screen.queryByTestId('spotify-browse-close')).toBeNull());
  });

  it('shows the error inline and keeps the sheet open rather than failing silently', async () => {
    mockedGetFitnessContent.mockResolvedValue({
      items: [],
      error: 'Spotify’s workout picks aren’t available right now.',
    });
    mockedHook.mockReturnValue(player());
    await renderControls();

    await fireEvent.press(screen.getByTestId('spotify-browse'));

    await waitFor(() =>
      expect(screen.getByTestId('spotify-browse-search-error').props.children).toBe(
        'Spotify’s workout picks aren’t available right now.',
      ),
    );
  });

  it('surfaces a play failure (e.g. Premium required) without closing the sheet', async () => {
    mockedPlaySpotifyContent.mockResolvedValue('Spotify Premium is needed to control playback.');
    mockedHook.mockReturnValue(player());
    await renderControls();
    await fireEvent.press(screen.getByTestId('spotify-browse'));
    await waitFor(() => expect(screen.getByTestId('spotify-browse-item-item-1')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('spotify-browse-item-item-1'));

    await waitFor(() =>
      expect(screen.getByTestId('spotify-browse-error').props.children).toBe(
        'Spotify Premium is needed to control playback.',
      ),
    );
    // Still open — a failed play attempt is not "task complete."
    expect(screen.getByTestId('spotify-browse-item-item-1')).toBeTruthy();
  });
});

function fresh(id: string, over: Partial<SpotifyContentItem> = {}): SpotifyContentItem {
  return contentItem({
    identifier: id,
    title: `Fresh ${id}`,
    uri: `spotify:playlist:${id}`,
    isPlayable: true,
    isContainer: true,
    ...over,
  });
}

const lastVibes = () => {
  const calls = mockedGetFitnessContent.mock.calls;
  return calls[calls.length - 1][0];
};

const chipSelected = (id: string) =>
  screen.getByTestId(`spotify-vibe-${id}`).props.accessibilityState.selected as boolean;

async function openSheet() {
  await fireEvent.press(screen.getByTestId('spotify-browse'));
  await waitFor(() => expect(screen.getByTestId('spotify-browse-refresh')).toBeTruthy());
  await waitFor(() => expect(screen.queryByTestId('spotify-browse-loading')).toBeNull());
}

describe('SpotifyControls browse sheet — vibes, recents and favorites', () => {
  beforeEach(() => {
    mockedHook.mockReturnValue(player());
    mockedGetFitnessContent.mockResolvedValue({ items: [fresh('f1'), fresh('f2')], error: null });
  });

  it('defaults to Anything when nothing is saved, so the first open still has results', async () => {
    await renderControls();
    await openSheet();

    expect(lastVibes()).toEqual(['anything']);
    expect(chipSelected('anything')).toBe(true);
    expect(chipSelected('rock')).toBe(false);
    expect(screen.getByTestId('spotify-browse-item-f1')).toBeTruthy();
  });

  it('pre-selects the saved vibes and ignores ids it does not know', async () => {
    const db = await renderControls();
    usersRepo.updateUser(db, { spotifyVibes: ['metal', 'retired-vibe'] }, new Date().toISOString());
    await openSheet();

    expect(lastVibes()).toEqual(['metal']);
    expect(chipSelected('metal')).toBe(true);
    expect(chipSelected('anything')).toBe(false);
  });

  it('persists a toggle immediately and re-searches with the new vibe ids', async () => {
    const db = await renderControls();
    await openSheet();
    mockedGetFitnessContent.mockClear();

    await fireEvent.press(screen.getByTestId('spotify-vibe-rock'));
    await waitFor(() => expect(lastVibes()).toEqual(['rock']));
    expect(usersRepo.getUser(db)!.spotifyVibes).toEqual(['rock']);

    await fireEvent.press(screen.getByTestId('spotify-vibe-metal'));
    await waitFor(() => expect(lastVibes()).toEqual(['rock', 'metal']));
    expect(usersRepo.getUser(db)!.spotifyVibes).toEqual(['rock', 'metal']);

    // Deselecting the last genre falls back to Anything rather than an empty selection.
    await fireEvent.press(screen.getByTestId('spotify-vibe-metal'));
    await fireEvent.press(screen.getByTestId('spotify-vibe-rock'));
    await waitFor(() => expect(lastVibes()).toEqual(['anything']));
    expect(usersRepo.getUser(db)!.spotifyVibes).toEqual(['anything']);
  });

  it('keeps Anything and the genres mutually exclusive', async () => {
    await renderControls();
    await openSheet();
    await fireEvent.press(screen.getByTestId('spotify-vibe-rock'));
    await fireEvent.press(screen.getByTestId('spotify-vibe-metal'));
    expect(chipSelected('anything')).toBe(false);
    expect(chipSelected('rock')).toBe(true);
    expect(chipSelected('metal')).toBe(true);

    await fireEvent.press(screen.getByTestId('spotify-vibe-anything'));
    expect(chipSelected('anything')).toBe(true);
    expect(chipSelected('rock')).toBe(false);
    expect(chipSelected('metal')).toBe(false);

    await fireEvent.press(screen.getByTestId('spotify-vibe-rock'));
    expect(chipSelected('anything')).toBe(false);
    expect(chipSelected('rock')).toBe(true);
  });

  it('re-rolls the search from the Fresh picks refresh button', async () => {
    await renderControls();
    await openSheet();
    mockedGetFitnessContent.mockClear();
    mockedGetFitnessContent.mockResolvedValue({ items: [fresh('f3')], error: null });

    await fireEvent.press(screen.getByTestId('spotify-browse-refresh'));

    await waitFor(() => expect(screen.getByTestId('spotify-browse-item-f3')).toBeTruthy());
    expect(mockedGetFitnessContent).toHaveBeenCalledTimes(1);
    expect(lastVibes()).toEqual(['anything']);
    expect(screen.queryByTestId('spotify-browse-item-f1')).toBeNull();
  });

  it('shows no chips on a drilled-in level', async () => {
    mockedGetContentChildren.mockResolvedValue({
      items: [contentItem({ identifier: 't1', title: 'Track' })],
      error: null,
    });
    await renderControls();
    await openSheet();
    expect(screen.getByTestId('spotify-vibes')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('spotify-browse-drill-f1'));
    await waitFor(() => expect(screen.getByTestId('spotify-browse-item-t1')).toBeTruthy());

    expect(screen.queryByTestId('spotify-vibes')).toBeNull();
  });

  it('opens Favorites expanded and Recently played collapsed, and toggles both headers', async () => {
    const db = await renderControls();
    spotifyPlaylistsRepo.setPlaylistFavorite(db, saved('fav1'), true, new Date());
    spotifyPlaylistsRepo.recordPlaylistPlayed(db, saved('rec1'), new Date());
    spotifyPlaylistsRepo.recordPlaylistPlayed(db, saved('rec2'), new Date());
    await openSheet();

    const favHeader = screen.getByTestId('spotify-browse-section-favorites');
    const recHeader = screen.getByTestId('spotify-browse-section-recents');
    expect(favHeader.props.accessibilityState.expanded).toBe(true);
    expect(recHeader.props.accessibilityState.expanded).toBe(false);
    expect(screen.getByText('Recently played · 2')).toBeTruthy();
    expect(screen.getByTestId('spotify-browse-item-fav1')).toBeTruthy();
    expect(screen.queryByTestId('spotify-browse-item-rec1')).toBeNull();

    await fireEvent.press(recHeader);
    expect(screen.getByTestId('spotify-browse-item-rec1')).toBeTruthy();
    expect(
      screen.getByTestId('spotify-browse-section-recents').props.accessibilityState.expanded,
    ).toBe(true);

    await fireEvent.press(favHeader);
    expect(screen.queryByTestId('spotify-browse-item-fav1')).toBeNull();
  });

  it('hides Favorites and Recently played when empty but always keeps Fresh picks', async () => {
    await renderControls();
    await openSheet();

    expect(screen.queryByTestId('spotify-browse-section-favorites')).toBeNull();
    expect(screen.queryByTestId('spotify-browse-section-recents')).toBeNull();
    expect(screen.getByText('Fresh picks')).toBeTruthy();
  });

  it('hearts and un-hearts in place, moving rows between sections', async () => {
    const db = await renderControls();
    spotifyPlaylistsRepo.recordPlaylistPlayed(db, saved('rec1', 'Played Mix'), new Date());
    await openSheet();
    await fireEvent.press(screen.getByTestId('spotify-browse-section-recents'));

    const heart = screen.getByLabelText('Favorite Played Mix');
    expect(heart.props.accessibilityState.selected).toBe(false);
    await fireEvent.press(heart);

    // Moved: Recents is now empty (hidden), Favorites has it, and the heart reads as selected.
    expect(screen.queryByTestId('spotify-browse-section-recents')).toBeNull();
    expect(screen.getByText('Favorites · 1')).toBeTruthy();
    expect(screen.getByLabelText('Unfavorite Played Mix').props.accessibilityState.selected).toBe(
      true,
    );
    expect(spotifyPlaylistsRepo.listFavoritePlaylists(db).map((p) => p.playlistId)).toEqual([
      'rec1',
    ]);

    await fireEvent.press(screen.getByLabelText('Unfavorite Played Mix'));
    // It was played, so it goes back to Recents rather than vanishing.
    expect(screen.queryByTestId('spotify-browse-section-favorites')).toBeNull();
    expect(screen.getByText('Recently played · 1')).toBeTruthy();
    expect(screen.getByTestId('spotify-browse-item-rec1')).toBeTruthy();
  });

  it('favorites a fresh pick without playing it, and returns it to Fresh when un-hearted', async () => {
    const db = await renderControls();
    await openSheet();

    await fireEvent.press(screen.getByLabelText('Favorite Fresh f1'));

    expect(screen.getByText('Favorites · 1')).toBeTruthy();
    // Shown once (in Favorites), not also under Fresh picks.
    expect(screen.getAllByTestId('spotify-browse-item-f1')).toHaveLength(1);
    expect(spotifyPlaylistsRepo.listFavoritePlaylists(db)[0]).toMatchObject({
      playlistId: 'f1',
      name: 'Fresh f1',
      owner: 'Workout Mix',
    });

    await fireEvent.press(screen.getByLabelText('Unfavorite Fresh f1'));
    expect(screen.queryByTestId('spotify-browse-section-favorites')).toBeNull();
    expect(screen.getAllByTestId('spotify-browse-item-f1')).toHaveLength(1);
    expect(screen.getByLabelText('Favorite Fresh f1')).toBeTruthy();
  });

  it('records a root-level playlist when playing it succeeds', async () => {
    const db = await renderControls();
    await openSheet();

    await fireEvent.press(screen.getByTestId('spotify-browse-item-f1'));

    await waitFor(() => expect(screen.queryByTestId('spotify-browse-item-f1')).toBeNull());
    expect(spotifyPlaylistsRepo.listRecentPlaylists(db)).toEqual([
      expect.objectContaining({
        playlistId: 'f1',
        uri: 'spotify:playlist:f1',
        name: 'Fresh f1',
        owner: 'Workout Mix',
        playCount: 1,
      }),
    ]);
  });

  it('does not record a playlist whose play failed', async () => {
    mockedPlaySpotifyContent.mockResolvedValue('Spotify Premium is needed to control playback.');
    const db = await renderControls();
    await openSheet();

    await fireEvent.press(screen.getByTestId('spotify-browse-item-f1'));

    await waitFor(() => expect(screen.getByTestId('spotify-browse-error')).toBeTruthy());
    expect(spotifyPlaylistsRepo.listRecentPlaylists(db)).toEqual([]);
  });

  it('records the parent playlist when a track inside it is played', async () => {
    mockedGetContentChildren.mockResolvedValue({
      items: [
        contentItem({
          identifier: 'track-1',
          title: 'Track One',
          uri: 'spotify:track:t1',
          isPlayable: true,
          isContainer: false,
        }),
      ],
      error: null,
    });
    const db = await renderControls();
    await openSheet();
    await fireEvent.press(screen.getByTestId('spotify-browse-drill-f2'));
    await waitFor(() => expect(screen.getByTestId('spotify-browse-item-track-1')).toBeTruthy());
    // Tracks are not playlists: no heart on a drilled-in row.
    expect(screen.queryByTestId('spotify-browse-favorite-track-1')).toBeNull();

    await fireEvent.press(screen.getByTestId('spotify-browse-item-track-1'));

    await waitFor(() => expect(mockedPlaySpotifyContent).toHaveBeenCalledWith('spotify:track:t1'));
    expect(spotifyPlaylistsRepo.listRecentPlaylists(db).map((p) => p.playlistId)).toEqual(['f2']);
  });

  it('still shows favorites and recents when the search fails, e.g. offline', async () => {
    mockedGetFitnessContent.mockResolvedValue({
      items: [],
      error: 'Spotify’s workout picks aren’t available right now.',
    });
    const db = await renderControls();
    spotifyPlaylistsRepo.setPlaylistFavorite(db, saved('fav1'), true, new Date());
    spotifyPlaylistsRepo.recordPlaylistPlayed(db, saved('rec1'), new Date());
    await openSheet();

    // The error replaces only the Fresh picks body.
    expect(screen.getByTestId('spotify-browse-search-error')).toBeTruthy();
    expect(screen.getByTestId('spotify-browse-item-fav1')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('spotify-browse-section-recents'));
    expect(screen.getByTestId('spotify-browse-item-rec1')).toBeTruthy();
  });

  it('passes favorites and recents to the search as ids to exclude', async () => {
    const db = await renderControls();
    spotifyPlaylistsRepo.setPlaylistFavorite(db, saved('fav1'), true, new Date());
    spotifyPlaylistsRepo.recordPlaylistPlayed(db, saved('rec1'), new Date());
    await openSheet();

    const options = mockedGetFitnessContent.mock.calls[0][1];
    expect(new Set(options?.excludeIds)).toEqual(new Set(['fav1', 'rec1']));
  });
});
