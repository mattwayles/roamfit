/**
 * §10.5 timed-exercise interaction (unilateral half), driven through the real WorkoutScreen
 * (issue #18). See `timedTestHelpers.ts`'s header for why this is a separate file from the
 * bilateral half rather than a second `it` there.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { sessionsRepo } from '@roamfit/store';
import WorkoutScreen from './WorkoutScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { setUpTimedEntry } from './timedTestHelpers';

function mockNavigation() {
  return { navigate: jest.fn(), replace: jest.fn(), reset: jest.fn(), goBack: jest.fn() };
}

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };
// Generous, per issue #14's lesson: this file's real ~5-9s of stacked wall-clock timers were
// observed to occasionally exceed even a 15s budget when Jest runs this file in a worker
// alongside `WorkoutScreen.timedBilateral.test.tsx`'s own real timers — genuine CPU contention
// between two real-timer-heavy suites, not a bug in the timer logic itself (each passes reliably
// alone). 30s gives real headroom over that.
const LONG_WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 30000, interval: 50 };

function Setup({ onReady }: { onReady: (db: ReturnType<typeof useStore>['db']) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

describe('§10.5 timed exercise (unilateral), driven through WorkoutScreen', () => {
  it('runs two sequential timers with a switch-side interval, summing actual seconds held', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const { sessionId, entryId } = await setUpTimedEntry(db, 'timed-unilateral-seed', {
      durationSec: 2,
      unilateral: true,
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

    await waitFor(() => expect(screen.getByTestId('timed-circle')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByText(/Side 1 of 2/)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('timed-circle'));

    // Side 1 runs (get-ready + 2s hold), then the switch-side interval appears — the ring says
    // which phase it is in, rather than a separate label under it.
    await waitFor(
      () => expect(screen.getByTestId('timed-caption')).toHaveTextContent('Switch sides'),
      LONG_WAIT_OPTS,
    );

    // ...then side 2 begins automatically once the switch interval elapses.
    await waitFor(() => {
      expect(screen.getByTestId('timed-caption')).not.toHaveTextContent('Switch sides');
      expect(screen.getByText(/Side 2 of 2/)).toBeTruthy();
    }, LONG_WAIT_OPTS);

    // Side 2 completes on its own (no long press needed) and the screen auto-advances to
    // rest, per §10.5 "on completion, auto-advance to the rest timer."
    await waitFor(() => expect(screen.getByTestId('rest-circle')).toBeTruthy(), LONG_WAIT_OPTS);

    const after = sessionsRepo.getSession(db, sessionId)!;
    const setLog = after.entries.find((e) => e.id === entryId)!.setLogs[0];
    expect(setLog.status).toBe('completed');
    // Both 2s sides completed in full -> actual seconds held is the sum, 4s (never the single
    // side's 2s, and never the un-summed default of 0).
    expect(setLog.secondsActual).toBe(4);
  }, 60000);
});
