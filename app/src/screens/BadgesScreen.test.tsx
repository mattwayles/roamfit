/**
 * Track 38c - the Badges screen: count, earned and locked emblems, the detail sheet (with the
 * link to the workout it came from), and opening the screen marks what it shows as seen.
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
import { Text } from 'react-native';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };
const Stack = createNativeStackNavigator<RootStackParamList>();

function History(): React.JSX.Element {
  return <Text testID="history-stub">history</Text>;
}

describe('BadgesScreen', () => {
  it('shows earned and locked badges, opens the sheet, links to the workout and marks badges seen', async () => {
    const db = getDb();
    badgesRepo.insertEarnedBadges(
      db,
      [
        { badgeId: 'sessions_1', localDate: '2026-10-01', sessionId: 'sess-1', retroactive: false },
        { badgeId: 'level_ups_1', localDate: '2026-10-02', sessionId: null, retroactive: true },
      ],
      '2026-10-02T12:00:00.000Z',
    );
    expect(badgesRepo.countUnseen(db)).toBe(2);

    render(
      <StoreProvider>
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Badges" component={BadgesScreen} />
            <Stack.Screen name="SessionHistory" component={History} />
          </Stack.Navigator>
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('badge-sessions_1')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('badges-count').props.children.join('')).toMatch(/^2 of \d+ earned$/);
    // Earned and locked, by their labels.
    expect(screen.getByTestId('badge-sessions_1').props.accessibilityLabel).toMatch(
      /First Steps, earned/,
    );
    expect(screen.getByTestId('badge-sessions_5').props.accessibilityLabel).toMatch(
      /locked, 0 of 5/,
    );
    // Hidden badges are not named.
    expect(screen.getByTestId('badge-early_bird_1').props.accessibilityLabel).toBe(
      'Hidden badge, locked',
    );
    // NEW dots this visit, then seen in the store.
    expect(screen.getByTestId('badge-emblem-sessions_1-new')).toBeTruthy();
    await waitFor(() => expect(badgesRepo.countUnseen(db)).toBe(0), WAIT_OPTS);

    // Locked sheet: progress.
    fireEvent.press(screen.getByTestId('badge-sessions_5'));
    await waitFor(() => expect(screen.getByTestId('badge-sheet-progress')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('badge-sheet-progress').props.children).toBe('0 of 5');
    fireEvent.press(screen.getByTestId('badge-sheet-backdrop'));

    // Earned sheet: date and the workout link.
    fireEvent.press(screen.getByTestId('badge-sessions_1'));
    await waitFor(() => expect(screen.getByTestId('badge-sheet-session')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('badge-sheet-session'));
    await waitFor(() => expect(screen.getByTestId('history-stub')).toBeTruthy(), WAIT_OPTS);
  });
});
