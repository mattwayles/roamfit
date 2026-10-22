/**
 * Track 44a - the badge sheet's "Earned during" row: an earned badge links to the read-only page
 * of the workout it came from (its own file so the render environment starts clean).
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { createRng, seedFromString } from '@roamfit/engine';
import { completeSession, generate, sessionsRepo } from '@roamfit/store';
import { StoreProvider } from '../state/StoreContext';
import { getDb } from '../db';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import type { RootStackParamList } from '../navigation/types';
import BadgesScreen from './BadgesScreen';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };
const Stack = createNativeStackNavigator<RootStackParamList>();

describe('BadgesScreen earned-during link', () => {
  it('links an earned badge to the workout it came from', async () => {
    const db = getDb();
    const clock = nowEngineClock();
    const utcInstant = nowUtcInstant();
    const { plan, comebackTier, recoveryWeekManual } = generate(db, {
      library: exerciseLibrary,
      families: familyLibrary,
      request: { focus: 'full', difficulty: 'medium', targetMinutes: 20 },
      clock,
      rng: createRng(seedFromString('badge-session')),
      utcInstant,
    });
    const sessionId = sessionsRepo.createPendingSession(db, {
      plan,
      utcInstant,
      localDate: clock.today,
      tzId: clock.tzId,
      comebackTier,
      recoveryWeekManual,
    });
    sessionsRepo.startSession(db, sessionId, utcInstant);
    completeSession(
      db,
      { sessionId, library: exerciseLibrary, families: familyLibrary },
      nowUtcInstant(),
    );
    render(
      <StoreProvider>
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Badges" component={BadgesScreen} />
            <Stack.Screen name="SessionHistory">{() => null}</Stack.Screen>
          </Stack.Navigator>
        </NavigationContainer>
      </StoreProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('trail-sessions')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('trail-sessions'));
    await waitFor(
      () => expect(screen.getByTestId('trail-tier-sessions_1')).toBeTruthy(),
      WAIT_OPTS,
    );
    fireEvent.press(screen.getByTestId('trail-tier-sessions_1'));
    await waitFor(() => expect(screen.getByTestId('badge-sheet-session')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('badge-sheet-session').props.accessibilityLabel).toMatch(
      /^Earned during .* · Full body · \d+ min$/,
    );
    fireEvent.press(screen.getByTestId('badge-sheet-session'));
    await waitFor(() => expect(screen.queryByTestId('badge-sheet-session')).toBeNull(), WAIT_OPTS);
  });
});
