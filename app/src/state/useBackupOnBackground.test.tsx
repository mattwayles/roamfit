import React from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { render } from '@testing-library/react-native';
import * as icloudBackup from '../lib/icloudBackup';
import { StoreProvider } from './StoreContext';
import { useBackupOnBackground } from './useBackupOnBackground';

function Probe(): null {
  useBackupOnBackground();
  return null;
}

describe('useBackupOnBackground', () => {
  afterEach(() => jest.restoreAllMocks());

  it('backs up when the app goes to the background, not when it becomes active, and unsubscribes', async () => {
    const backup = jest.spyOn(icloudBackup, 'runBackup').mockResolvedValue({ kind: 'failed' });
    const remove = jest.fn();
    let listener: (s: AppStateStatus) => void = () => {};
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, l) => {
      listener = l;
      return { remove };
    });

    const view = await render(
      <StoreProvider>
        <Probe />
      </StoreProvider>,
    );
    listener('active');
    listener('inactive');
    expect(backup).not.toHaveBeenCalled();
    listener('background');
    expect(backup).toHaveBeenCalledTimes(1);
    expect(backup.mock.calls[0][1]).toEqual({ reason: 'background' });

    await view.unmount();
    expect(remove).toHaveBeenCalled();
  });
});
