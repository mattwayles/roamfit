/**
 * §10.4/§10.8/§10.10 — "return to Home from an active workout" (real device-testing request).
 *
 * Distinct from Abandon (`AbandonSessionButton`, destructive, discards the session) and from the
 * header's own back button (off entirely in `RootNavigator` — `headerBackVisible: false` — since
 * a bare back-gesture never gets a chance to pause first). Home is reached by pausing the session
 * (the same `pauseSession` the workout-level Pause button already uses) and navigating, so the
 * session stays `active`/pending and Home's resume card picks it back up at the same set.
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

describe('return to Home from an active workout', () => {
  it('pauses the session and navigates Home, leaving the session active and resumable', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const { sessionId } = await setUpTimedEntry(db, 'go-home-seed', {
      durationSec: 30,
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

    await waitFor(() => expect(screen.getByTestId('home-workout')).toBeTruthy(), WAIT_OPTS);
    expect(sessionsRepo.getSession(db, sessionId)!.pausedAt).toBeNull();

    await fireEvent.press(screen.getByTestId('home-workout'));

    expect(navigation.navigate).toHaveBeenCalledWith('Home');
    // Paused, not discarded — the session is still the app's pending session and still active.
    const afterGoHome = sessionsRepo.getSession(db, sessionId)!;
    expect(afterGoHome.pausedAt).not.toBeNull();
    expect(afterGoHome.status).toBe('active');
    expect(sessionsRepo.getPendingSession(db)?.id).toBe(sessionId);
  }, 20000);
});
