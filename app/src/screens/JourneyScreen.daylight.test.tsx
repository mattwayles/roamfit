/** Journey under the Daylight theme: paper values flow through the screen and its RungTrack. */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { familyLibrary } from '@roamfit/data';
import { StyleSheet } from 'react-native';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider } from '../state/StoreContext';
import { daylight, daylightTheme } from '../theme';
import { inDaylight } from '../ui/test-utils';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

describe('Journey in Daylight', () => {
  it('tints notes with the Daylight summit, draws rung nodes in deep summit, and cards on paper', async () => {
    render(
      inDaylight(
        <StoreProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </StoreProvider>,
      ),
    );
    await waitFor(() => expect(screen.getByTestId('disclaimer-gate')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('disclaimer-acknowledge'));
    await waitFor(() => expect(screen.getByTestId('today-card')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('tab-Journey'));
    await waitFor(() => expect(screen.getByTestId('journey-screen')).toBeTruthy(), WAIT_OPTS);

    const note = StyleSheet.flatten(screen.getByTestId('first-session-explanation').props.style);
    expect(note.backgroundColor).toBe(daylightTheme.tints.summit);

    const id = familyLibrary.families[0]!.id;
    const row = StyleSheet.flatten(screen.getByTestId(`board-row-${id}`).props.style);
    expect(row.backgroundColor).toBe(daylight.surface);
    const node = StyleSheet.flatten(screen.getByTestId(`board-track-${id}-node-0`).props.style);
    expect(node.backgroundColor).toBe(daylight.summit);
  });
});
