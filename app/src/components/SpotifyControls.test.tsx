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
import { fireEvent, render, screen } from '@testing-library/react-native';
import SpotifyControls from './SpotifyControls';
import { useSpotifyPlayer } from '../lib/spotifyRemote';
import type { SpotifyPlayer } from '../lib/spotifyRemote';

jest.mock('../lib/spotifyRemote', () => ({ useSpotifyPlayer: jest.fn() }));

const mockedHook = useSpotifyPlayer as jest.MockedFunction<typeof useSpotifyPlayer>;

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

beforeEach(() => jest.clearAllMocks());

describe('SpotifyControls', () => {
  it('renders nothing at all when there is no native module', async () => {
    // Not a disabled row and not an explanation — a build without Spotify should look like a
    // build that never had it.
    mockedHook.mockReturnValue(player({ available: false, connectionState: 'unavailable' }));
    await render(<SpotifyControls />);

    expect(screen.queryByTestId('spotify-controls')).toBeNull();
  });

  it('offers a single tap to connect before anything is connected', async () => {
    mockedHook.mockReturnValue(player({ connectionState: 'disconnected', track: null }));
    await render(<SpotifyControls />);

    // No transport controls yet — there is nothing to control.
    expect(screen.queryByTestId('spotify-play-pause')).toBeNull();

    await fireEvent.press(screen.getByTestId('spotify-connect'));
    expect(actions.connect).toHaveBeenCalled();
  });

  it('will not let the connect button be pressed twice while the auth bounce is in flight', async () => {
    mockedHook.mockReturnValue(player({ connectionState: 'connecting', track: null }));
    await render(<SpotifyControls />);

    expect(screen.getByTestId('spotify-connect').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('spotify-connect'));
    expect(actions.connect).not.toHaveBeenCalled();
  });

  it('shows what is playing once connected', async () => {
    mockedHook.mockReturnValue(player());
    await render(<SpotifyControls />);

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
    await render(<SpotifyControls />);

    // Clipped, not wrapped: a second line would push the exercise hero down the screen.
    expect(screen.getByTestId('spotify-track').props.numberOfLines).toBe(1);
    expect(screen.getByTestId('spotify-artist').props.numberOfLines).toBe(1);
  });

  it('says it is connected before Spotify has reported a track', async () => {
    mockedHook.mockReturnValue(player({ track: null }));
    await render(<SpotifyControls />);

    expect(screen.getByTestId('spotify-track').props.children).toBe('Connected to Spotify');
    expect(screen.queryByTestId('spotify-artist')).toBeNull();
    // The transport is still offered — resume is exactly what you want when nothing is playing.
    expect(screen.getByTestId('spotify-play-pause')).toBeTruthy();
  });

  it('drives each transport control', async () => {
    mockedHook.mockReturnValue(player());
    await render(<SpotifyControls />);

    await fireEvent.press(screen.getByTestId('spotify-previous'));
    await fireEvent.press(screen.getByTestId('spotify-play-pause'));
    await fireEvent.press(screen.getByTestId('spotify-next'));

    expect(actions.skipPrevious).toHaveBeenCalledTimes(1);
    expect(actions.togglePlay).toHaveBeenCalledTimes(1);
    expect(actions.skipNext).toHaveBeenCalledTimes(1);
  });

  it('labels play/pause for what the press will do, in both directions', async () => {
    mockedHook.mockReturnValue(player({ isPlaying: true }));
    const { rerender } = await render(<SpotifyControls />);
    expect(screen.getByLabelText('Pause Spotify')).toBeTruthy();

    mockedHook.mockReturnValue(player({ isPlaying: false }));
    await rerender(<SpotifyControls />);
    expect(screen.getByLabelText('Play Spotify')).toBeTruthy();
  });

  it('disables a skip Spotify itself refuses, rather than letting it do nothing', async () => {
    // What an advert looks like from here.
    mockedHook.mockReturnValue(player({ canSkipNext: false, canSkipPrevious: false }));
    await render(<SpotifyControls />);

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
    await render(<SpotifyControls />);

    expect(screen.getByTestId('spotify-error').props.children).toBe(
      'Spotify Premium is needed to control playback.',
    );
  });

  it('shows an error that arrives while connected without dropping the transport', async () => {
    mockedHook.mockReturnValue(player({ lastError: 'Couldn’t reach the Spotify app.' }));
    await render(<SpotifyControls />);

    expect(screen.getByTestId('spotify-error')).toBeTruthy();
    expect(screen.getByTestId('spotify-play-pause')).toBeTruthy();
  });
});
