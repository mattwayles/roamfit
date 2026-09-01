/**
 * Invariant 1 at the screen level. Track 6f wired `processLlmQueue` into `runOpportunisticSync`,
 * which `HomeScreen` calls fire-and-forget on focus. The isolation that keeps that off the core
 * loop was only ever tested inside `opportunisticSync.ts` itself — this asserts the guarantee
 * where it actually matters: Home still renders real local data when the whole background sync
 * chain rejects outright.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { render, screen, waitFor } from '@testing-library/react-native';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider } from '../state/StoreContext';

jest.mock('../lib/opportunisticSync', () => ({
  runOpportunisticSync: jest.fn(() => Promise.reject(new Error('sync layer is down'))),
}));

describe('§11.1/§11.6 — a totally failed background sync never reaches the core loop', () => {
  it('Home still renders its local data when runOpportunisticSync rejects', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      render(
        <StoreProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </StoreProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('today-card')).toBeTruthy());
      await new Promise((r) => setTimeout(r, 50));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
