/**
 * Top-left nav item — "return to Home from an active workout" (real device-testing request).
 *
 * Same convention as `SummaryScreen`'s own `headerLeft` override: a native chevron+label button
 * set via `navigation.setOptions`, not a text link buried in the page body. Distinct from Abandon
 * (`AbandonSessionButton`, destructive, discards the session) and from the default header back
 * button — off entirely in `RootNavigator` (`headerBackVisible: false`) because it would pop to
 * whatever is underneath on the stack (Generate, Summary, or Home, depending on how Workout was
 * reached) without pausing first. This button always pauses (the same `pauseSession` the
 * workout-level Pause button already uses) and always goes to Home, so Home's resume card picks
 * the session back up at the same set.
 */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
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

describe('top-left Home nav item on an active workout', () => {
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

    await waitFor(() => expect(navigation.setOptions).toHaveBeenCalled(), WAIT_OPTS);
    const headerLeftCall = navigation.setOptions.mock.calls
      .filter(([opts]) => opts.headerLeft != null)
      .at(-1);
    expect(headerLeftCall).toBeTruthy();
    const headerView = await render(headerLeftCall![0].headerLeft());

    expect(sessionsRepo.getSession(db, sessionId)!.pausedAt).toBeNull();

    fireEvent.press(headerView.getByTestId('workout-home'));

    expect(navigation.navigate).toHaveBeenCalledWith('Home');
    // Paused, not discarded — the session is still the app's pending session and still active.
    const afterGoHome = sessionsRepo.getSession(db, sessionId)!;
    expect(afterGoHome.pausedAt).not.toBeNull();
    expect(afterGoHome.status).toBe('active');
    expect(sessionsRepo.getPendingSession(db)?.id).toBe(sessionId);
  }, 20000);
});
