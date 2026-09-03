/**
 * §10.10 "abandon a pending workout and start fresh" — real device-testing request, entry point
 * on Home. Drives the real navigator + real store (nothing mocked): a single tap must NOT
 * discard anything (confirm-before-destroy, since abandoning loses logged sets); confirming must
 * clear the §10.10 pending slot entirely and land on Generate **with the pickers**, not a re-run
 * of the discarded plan.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo, usersRepo } from '@roamfit/store';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

function Setup({ onReady }: { onReady: (db: ReturnType<typeof useStore>['db']) => void }) {
  const { db } = useStore();
  usersRepo.acknowledgeDisclaimer(db, new Date().toISOString());
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
    request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString('home-abandon-test-seed')),
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
  sessionsRepo.startSession(db, sessionId, nowUtcInstant());
  return sessionId;
}

describe('§10.10 abandon a pending workout, driven from Home', () => {
  it('a single tap does not discard; confirming clears the pending slot and lands on Generate', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const sessionId = await createPendingSession(db);

    render(
      <StoreProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('resume-card')).toBeTruthy(), WAIT_OPTS);
    await waitFor(() => expect(screen.getByTestId('abandon-button')).toBeTruthy(), WAIT_OPTS);

    // --- A single tap alone must not destroy anything -------------------------------------
    await fireEvent.press(screen.getByTestId('abandon-button'));
    await waitFor(() => expect(screen.getByTestId('abandon-confirm-row')).toBeTruthy(), WAIT_OPTS);
    expect(sessionsRepo.getPendingSession(db)?.id).toBe(sessionId); // still there

    // Cancelling backs out cleanly, still not discarded.
    await fireEvent.press(screen.getByTestId('abandon-confirm-cancel'));
    await waitFor(() => expect(screen.queryByTestId('abandon-confirm-row')).toBeNull(), WAIT_OPTS);
    expect(sessionsRepo.getPendingSession(db)?.id).toBe(sessionId);

    // --- Confirming actually discards, leaves no orphaned pending/active row --------------
    await fireEvent.press(screen.getByTestId('abandon-button'));
    await waitFor(() => expect(screen.getByTestId('abandon-confirm-row')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('abandon-confirm-yes'));

    await waitFor(() => expect(screen.getByTestId('generate-button')).toBeTruthy(), WAIT_OPTS);
    expect(sessionsRepo.getPendingSession(db)).toBeNull();

    const discarded = sessionsRepo.getSession(db, sessionId)!;
    expect(discarded.status).toBe('discarded');
  }, 20000);
});
