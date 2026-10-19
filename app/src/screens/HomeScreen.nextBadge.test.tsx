/**
 * Track 38c - the "Next badge" row on Today: the single closest locked badge with neutral
 * progress, pointing at the first badge before any is earned; a tap opens Badges.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { badgesRepo, usersRepo } from '@roamfit/store';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider, useStore } from '../state/StoreContext';
import { getDb } from '../db';
import { nowUtcInstant } from '../lib/localClock';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

function Ack({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { db } = useStore();
  usersRepo.acknowledgeDisclaimer(db, nowUtcInstant());
  return <>{children}</>;
}

describe('Today - Next badge row', () => {
  it('points at the first badge, moves on once it is earned, and opens Badges', async () => {
    render(
      <StoreProvider>
        <Ack>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </Ack>
      </StoreProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('next-badge-row')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('next-badge-row').props.accessibilityLabel).toBe(
      'Next badge: First Steps, 0 of 1. Open badges',
    );
    expect(screen.getByText('Next badge')).toBeTruthy();

    badgesRepo.insertEarnedBadges(
      getDb(),
      [{ badgeId: 'sessions_1', localDate: '2026-10-01', sessionId: null, retroactive: false }],
      '2026-10-01T12:00:00.000Z',
    );
    fireEvent.press(screen.getByTestId('tab-Journey'));
    await waitFor(() => expect(screen.getByTestId('journey-screen')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('tab-Home'));
    await waitFor(
      () =>
        expect(screen.getByTestId('next-badge-row').props.accessibilityLabel).toMatch(
          /^Next badge: (?!First Steps).*, \d+ of \d+\. Open badges$/,
        ),
      WAIT_OPTS,
    );

    fireEvent.press(screen.getByTestId('next-badge-row'));
    await waitFor(() => expect(screen.getByTestId('badges-screen')).toBeTruthy(), WAIT_OPTS);
  });
});
