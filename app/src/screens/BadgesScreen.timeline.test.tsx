/**
 * Track 44d - the Collection | Timeline toggle (its own file so the render environment starts
 * clean): months newest first, a found-in-history group, and a tap opens the badge sheet.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { badgesRepo } from '@roamfit/store';
import { StoreProvider } from '../state/StoreContext';
import { getDb } from '../db';
import type { RootStackParamList } from '../navigation/types';
import BadgesScreen from './BadgesScreen';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };
const Stack = createNativeStackNavigator<RootStackParamList>();

describe('BadgesScreen timeline', () => {
  it('switches to a month-grouped timeline and opens the sheet from an entry', async () => {
    badgesRepo.insertEarnedBadges(
      getDb(),
      [
        { badgeId: 'sessions_1', localDate: '2026-09-30', sessionId: null, retroactive: false },
        { badgeId: 'sessions_5', localDate: '2026-10-02', sessionId: null, retroactive: false },
        { badgeId: 'level_ups_1', localDate: '2026-08-01', sessionId: null, retroactive: true },
      ],
      '2026-10-02T12:00:00.000Z',
    );
    render(
      <StoreProvider>
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Badges" component={BadgesScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </StoreProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('trail-sessions')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId('badge-timeline')).toBeNull();

    expect(screen.getByTestId('badges-intro-climbing').props.children).toBe(
      'Moving up your exercise ladders.',
    );

    // Hidden badges: a "secrets found" line, and a locked one shows its riddle, never its name.
    expect(screen.getByTestId('badges-secrets').props.children).toMatch(/^0 of \d+ secrets found$/);
    await fireEvent.press(screen.getByTestId('badge-early_bird_1'));
    await waitFor(
      () => expect(screen.getByText('The trail is quietest before sunrise.')).toBeTruthy(),
      WAIT_OPTS,
    );
    expect(screen.queryByText('Early Bird')).toBeNull();
    await fireEvent.press(screen.getByTestId('badge-sheet-backdrop'));

    await fireEvent.press(screen.getByTestId('badges-view-timeline'));
    await waitFor(() => expect(screen.getByTestId('badge-timeline')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId('trail-sessions')).toBeNull();
    expect(screen.getByTestId('timeline-group-2026-10')).toBeTruthy();
    expect(screen.getByTestId('timeline-group-2026-09')).toBeTruthy();
    expect(screen.getByTestId('timeline-group-found')).toBeTruthy();
    expect(screen.getByText('Found in your history')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('timeline-badge-sessions_5'));
    await waitFor(() => expect(screen.getByTestId('badge-sheet-earned')).toBeTruthy(), WAIT_OPTS);

    await fireEvent.press(screen.getByTestId('badges-view-collection'));
    await waitFor(() => expect(screen.getByTestId('trail-sessions')).toBeTruthy(), WAIT_OPTS);
  });
});
