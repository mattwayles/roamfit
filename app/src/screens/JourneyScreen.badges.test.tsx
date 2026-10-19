/**
 * Track 38c - Journey's Badges card: the empty state, then the last earned emblems, a NEW pill
 * while a badge is unseen, the closest-badge progress line, and a tap into the Badges screen.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { badgesRepo } from '@roamfit/store';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider, useStore } from '../state/StoreContext';
import { getDb } from '../db';
import { usersRepo } from '@roamfit/store';
import { nowUtcInstant } from '../lib/localClock';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

function Ack({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { db } = useStore();
  usersRepo.acknowledgeDisclaimer(db, nowUtcInstant());
  return <>{children}</>;
}

describe('Journey - Badges card', () => {
  it('invites the first workout, then shows earned badges with a NEW pill until Badges is opened', async () => {
    render(
      <StoreProvider>
        <Ack>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </Ack>
      </StoreProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('tab-Journey')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('tab-Journey'));
    await waitFor(() => expect(screen.getByTestId('badges-card')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('badges-empty')).toBeTruthy();
    expect(screen.getByText('Your first badge comes with your first workout.')).toBeTruthy();
    expect(screen.queryByTestId('badges-new-dot')).toBeNull();
    expect(screen.getByTestId('badges-next-line')).toBeTruthy();

    badgesRepo.insertEarnedBadges(
      getDb(),
      [{ badgeId: 'sessions_1', localDate: '2026-10-01', sessionId: null, retroactive: false }],
      '2026-10-01T12:00:00.000Z',
    );
    fireEvent.press(screen.getByTestId('tab-Home'));
    await waitFor(() => expect(screen.getByTestId('today-screen')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('tab-Journey'));
    await waitFor(() => expect(screen.getByTestId('badges-new-dot')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('badges-recent-sessions_1')).toBeTruthy();
    expect(screen.queryByTestId('badges-empty')).toBeNull();

    fireEvent.press(screen.getByTestId('badges-card'));
    await waitFor(() => expect(screen.getByTestId('badges-screen')).toBeTruthy(), WAIT_OPTS);
    await waitFor(() => expect(badgesRepo.countUnseen(getDb())).toBe(0), WAIT_OPTS);
  });
});
