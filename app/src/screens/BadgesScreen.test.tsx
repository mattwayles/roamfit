/**
 * Track 38c - the Badges screen: count, earned and locked emblems, the detail sheet (with the
 * "Earned during" link to the workout it came from, share, series stepping, how-to hints for
 * locked badges), and opening the screen marks what it shows as seen.
 */
import React from 'react';
import { Share } from 'react-native';
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

describe('BadgesScreen', () => {
  it('shows earned and locked badges, opens the sheet and marks badges seen', async () => {
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
    expect(screen.getByTestId('badge-sheet-hint').props.children).toMatch(/\w/);
    expect(screen.getByTestId('badge-sheet-series').props.children).toBe('2nd of 8 in this series');
    // Step to the next badge in the series without closing the sheet.
    fireEvent.press(screen.getByTestId('badge-sheet-next'));
    await waitFor(
      () =>
        expect(screen.getByTestId('badge-sheet-series').props.children).toBe(
          '3rd of 8 in this series',
        ),
      WAIT_OPTS,
    );
    fireEvent.press(screen.getByTestId('badge-sheet-backdrop'));

    // Earned sheet: the date; no workout link because the session is not on file; share works;
    // the first of a series has nowhere to step back to.
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    fireEvent.press(screen.getByTestId('badge-sessions_1'));
    await waitFor(() => expect(screen.getByTestId('badge-sheet-earned')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId('badge-sheet-session')).toBeNull();
    expect(screen.queryByTestId('badge-sheet-hint')).toBeNull();
    expect(screen.getByTestId('badge-sheet-prev').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByTestId('badge-sheet-share'));
    expect(share).toHaveBeenCalledWith({ message: 'Earned the First Steps badge on Wanderlift' });
    share.mockRestore();
  });
});
