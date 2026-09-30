/**
 * Today's banners as icon cards (DESIGN.md §5.1) — same copy and actions as before, driven
 * through the real navigator and store. The travel suggestion (§9.3) is the one with actions:
 * accepting records a travel day for local today, "Not this time" only dismisses for this visit.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { signalsRepo, usersRepo } from '@roamfit/store';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider, useStore } from '../state/StoreContext';
import { getDb } from '../db';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

function Setup({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { db } = useStore();
  usersRepo.acknowledgeDisclaimer(db, nowUtcInstant()); // §13.3 gate — not this test's job
  const today = nowEngineClock().today;
  if (signalsRepo.getSignalEventsByType(db, 'tz_change').every((e) => e.localDate !== today)) {
    signalsRepo.logSignalEvent(db, {
      sessionId: null,
      type: 'tz_change',
      payload: { from: 'Europe/Lisbon', to: 'Asia/Tokyo' },
      utcInstant: nowUtcInstant(),
      localDate: today,
    });
  }
  return <>{children}</>;
}

async function mountToday() {
  render(
    <StoreProvider>
      <Setup>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </Setup>
    </StoreProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('travel-suggest-banner')).toBeTruthy(), WAIT_OPTS);
}

describe('Today — travel suggestion banner', () => {
  it('"Not this time" dismisses it without recording anything', async () => {
    await mountToday();
    const before = signalsRepo.getSignalEventsByType(getDb(), 'travel_day').length;
    await fireEvent.press(screen.getByTestId('travel-suggest-dismiss'));
    await waitFor(
      () => expect(screen.queryByTestId('travel-suggest-banner')).toBeNull(),
      WAIT_OPTS,
    );
    expect(signalsRepo.getSignalEventsByType(getDb(), 'travel_day').length).toBe(before);
  });

  it('accepting marks local today as a travel day and clears the banner', async () => {
    await mountToday();
    const today = nowEngineClock().today;
    await fireEvent.press(screen.getByTestId('travel-suggest-accept'));
    await waitFor(
      () => expect(screen.queryByTestId('travel-suggest-banner')).toBeNull(),
      WAIT_OPTS,
    );
    expect(
      signalsRepo.getSignalEventsByType(getDb(), 'travel_day').some((e) => e.localDate === today),
    ).toBe(true);
  });
});
