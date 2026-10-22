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

    await waitFor(() => expect(screen.getByTestId('trail-sessions')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('badges-count').props.children).toMatch(/^2 of \d+ earned$/);
    // The hero features the newest badge and the patches carry per-category counts.
    expect(screen.getByTestId('badges-hero-name')).toBeTruthy();
    expect(screen.getByTestId('badges-patch-showing_up').props.accessibilityLabel).toMatch(
      /^Showing up, 1 of \d+ earned$/,
    );
    expect(screen.getByTestId('badges-tally-bronze').props.children).toMatch(/^Bronze \d$/);
    // A series row names its current badge with neutral progress.
    expect(screen.getByTestId('trail-sessions').props.accessibilityLabel).toMatch(
      /1 of 8 earned, 0 of 5$/,
    );
    // One-offs sit in the Singles grid; hidden ones are not named.
    expect(screen.getByTestId('badge-early_bird_1').props.accessibilityLabel).toBe(
      'Hidden badge, locked',
    );
    // NEW dots this visit, then seen in the store.
    expect(screen.getByTestId('trail-sessions-new')).toBeTruthy();
    await waitFor(() => expect(badgesRepo.countUnseen(db)).toBe(0), WAIT_OPTS);

    // Series sheet: every tier; a locked tier shows neutral progress. Tapping one opens its sheet.
    fireEvent.press(screen.getByTestId('trail-sessions'));
    await waitFor(() => expect(screen.getByTestId('trail-sheet')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('trail-sheet-summary').props.children).toBe('1 of 8 earned');
    expect(screen.getByTestId('trail-tier-sessions_1-meta').props.children).toMatch(/^Earned /);
    expect(screen.getByTestId('trail-tier-sessions_5-meta').props.children).toBe('0 of 5');
    fireEvent.press(screen.getByTestId('trail-tier-sessions_5'));
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
    // Back to the series, then close.
    fireEvent.press(screen.getByTestId('badge-sheet-back-series'));
    await waitFor(() => expect(screen.getByTestId('trail-sheet')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('badge-sheet-backdrop'));

    // Earned sheet: the date; no workout link because the session is not on file; share works;
    // the first of a series has nowhere to step back to.
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    fireEvent.press(screen.getByTestId('trail-sessions'));
    await waitFor(
      () => expect(screen.getByTestId('trail-tier-sessions_1')).toBeTruthy(),
      WAIT_OPTS,
    );
    fireEvent.press(screen.getByTestId('trail-tier-sessions_1'));
    await waitFor(() => expect(screen.getByTestId('badge-sheet-earned')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId('badge-sheet-session')).toBeNull();
    expect(screen.queryByTestId('badge-sheet-hint')).toBeNull();
    expect(screen.getByTestId('badge-sheet-prev').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('badge-share-card', { includeHiddenElements: true })).toBeTruthy();
    fireEvent.press(screen.getByTestId('badge-sheet-share'));
    await waitFor(
      () =>
        expect(share).toHaveBeenCalledWith({
          url: 'file:///tmp/badge-share.png',
          message: 'Earned the First Steps badge on Wanderlift',
        }),
      WAIT_OPTS,
    );
    share.mockRestore();
  });
});
