import React from 'react';
import { render, screen } from '@testing-library/react-native';
import HowToVideoButton from './HowToVideoButton';
import { useIsOnline } from '../lib/networkStatus';

jest.mock('../lib/networkStatus', () => ({ useIsOnline: jest.fn() }));

describe('HowToVideoButton', () => {
  it('is hidden while offline', async () => {
    (useIsOnline as jest.Mock).mockReturnValue(false);
    await render(<HowToVideoButton exerciseName="Push-up" />);
    expect(screen.queryByTestId('how-to-video-link')).toBeNull();
  });

  it('shows while online', async () => {
    (useIsOnline as jest.Mock).mockReturnValue(true);
    await render(<HowToVideoButton exerciseName="Push-up" />);
    expect(screen.getByTestId('how-to-video-link')).toBeTruthy();
  });
});
