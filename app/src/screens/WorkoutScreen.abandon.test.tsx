/**
 * §10.10 abandon, entry point on Workout (an `active` session, mid-run). Proves the §8.3
 * "abandoned, and at exactly which exercise" signal is recorded with the real current
 * entry/set, that a single tap doesn't destroy anything, and that confirming leaves no orphaned
 * active row — the session flips to `discarded` and is no longer the §10.10 pending session.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { sessionsRepo } from '@roamfit/store';
import WorkoutScreen from './WorkoutScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { setUpTimedEntry } from './timedTestHelpers';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

function mockNavigation() {
  return {
    navigate: jest.fn(),
    replace: jest.fn(),
    reset: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
  };
}

function Setup({ onReady }: { onReady: (db: ReturnType<typeof useStore>['db']) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

describe('§10.10 abandon a pending workout, driven from Workout', () => {
  it('confirming discards the active session, records which exercise it was abandoned at, and clears the pending slot', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const { sessionId, entryId } = await setUpTimedEntry(db, 'workout-abandon-test-seed', {
      durationSec: 10,
      unilateral: false,
    });

    const navigation = mockNavigation();
    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={navigation as never}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('abandon-button')).toBeTruthy(), WAIT_OPTS);

    await fireEvent.press(screen.getByTestId('abandon-button'));
    await waitFor(() => expect(screen.getByTestId('abandon-confirm-row')).toBeTruthy(), WAIT_OPTS);
    // A single tap alone hasn't discarded anything yet.
    expect(sessionsRepo.getSession(db, sessionId)!.status).toBe('active');
    expect(navigation.navigate).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('abandon-confirm-yes'));

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('Home'), WAIT_OPTS);

    const after = sessionsRepo.getSession(db, sessionId)!;
    expect(after.status).toBe('discarded');
    expect(after.abandonedEntryId).toBe(entryId);
    expect(after.abandonedSetIndex).toBe(0);
    expect(sessionsRepo.getPendingSession(db)).toBeNull();
  }, 20000);
});
