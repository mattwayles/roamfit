import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import SpotifyButton from './SpotifyButton';
import { ready } from '../ui/test-utils';

describe('SpotifyButton', () => {
  afterEach(() => jest.restoreAllMocks());

  it('opens the Spotify app', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<SpotifyButton />);
    await ready('open-spotify');
    fireEvent.press(screen.getByTestId('open-spotify'));
    expect(open).toHaveBeenCalledWith('spotify://');
  });

  it('falls back to the web player when the app is not installed', async () => {
    const open = jest
      .spyOn(Linking, 'openURL')
      .mockRejectedValueOnce(new Error('no app'))
      .mockResolvedValue(true);
    render(<SpotifyButton />);
    await ready('open-spotify');
    fireEvent.press(screen.getByTestId('open-spotify'));
    await Promise.resolve();
    await Promise.resolve();
    expect(open).toHaveBeenLastCalledWith('https://open.spotify.com');
  });
});
