/**
 * §10.10 abandon, entry point on Approval — a `planned` (not-yet-started) session. Confirm
 * before destroy applies here too, and confirming must clear the pending slot and return to
 * Home.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo } from '@roamfit/store';
import ApprovalScreen from './ApprovalScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

function mockNavigation() {
  return { navigate: jest.fn(), replace: jest.fn(), reset: jest.fn(), goBack: jest.fn() };
}

function Setup({ onReady }: { onReady: (db: ReturnType<typeof useStore>['db']) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

async function createPendingSession(db: ReturnType<typeof useStore>['db']): Promise<string> {
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', effort: 'normal', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString('approval-abandon-test-seed')),
    utcInstant,
  });
  return sessionsRepo.createPendingSession(db, {
    plan,
    utcInstant,
    localDate: clock.today,
    tzId: clock.tzId,
    comebackTier,
    recoveryWeekManual,
  });
}

describe('§10.10 abandon a pending workout, driven from Approval', () => {
  it('confirming discards the planned session and navigates Home, without a confirm-less single tap doing anything', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const sessionId = await createPendingSession(db);
    const navigation = mockNavigation();
    render(
      <StoreProvider>
        <NavigationContainer>
          <ApprovalScreen
            navigation={navigation as never}
            route={{ key: 'Approval', name: 'Approval', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('abandon-button')).toBeTruthy(), WAIT_OPTS);

    await fireEvent.press(screen.getByTestId('abandon-button'));
    await waitFor(() => expect(screen.getByTestId('abandon-confirm-row')).toBeTruthy(), WAIT_OPTS);
    // A single tap (the one above) did not discard anything yet.
    expect(sessionsRepo.getPendingSession(db)?.id).toBe(sessionId);
    expect(navigation.navigate).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('abandon-confirm-yes'));

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('Home'), WAIT_OPTS);
    expect(sessionsRepo.getPendingSession(db)).toBeNull();
    expect(sessionsRepo.getSession(db, sessionId)!.status).toBe('discarded');
  });
});
