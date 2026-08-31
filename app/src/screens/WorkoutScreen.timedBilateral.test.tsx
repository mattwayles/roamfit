/**
 * §10.5 timed-exercise interaction (bilateral half), driven through the real WorkoutScreen
 * (issue #18 — this screen previously had no interaction test at all; both existing
 * `WorkoutScreen.*.test.tsx` files deliberately fast-forward past timed entries to reach a reps
 * entry). See `timedTestHelpers.ts`'s header for why this is a separate file from the unilateral
 * half rather than a second `it` here.
 *
 * Real wall-clock timers, not fake ones: `useCountdown` in `WorkoutScreen.tsx` is hardcoded to
 * `systemClock` (no clock-injection prop), so this test actually waits out short real durations
 * — same approach `WorkoutScreen.rest.test.tsx` uses, with the same generous `WAIT_OPTS` for
 * issue #14's CPU-load headroom.
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

function Setup({ onReady }: { onReady: (db: ReturnType<typeof useStore>['db']) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

describe('§10.5 timed exercise (bilateral), driven through WorkoutScreen', () => {
  it('tap-to-start -> 3s get-ready -> pause/resume -> End early records actual seconds held', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const { sessionId, entryId } = await setUpTimedEntry(db, 'timed-bilateral-seed', {
      durationSec: 8,
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

    await waitFor(() => expect(screen.getByTestId('timed-circle')).toBeTruthy(), WAIT_OPTS);
    // Never auto-starts.
    expect(screen.getByTestId('timed-remaining')).toHaveTextContent('Tap to start');

    await fireEvent.press(screen.getByTestId('start-timer'));

    // 3-second get-ready counts down before the hold itself starts (never auto-starts into the
    // hold either) — "Pause" appears once the hold itself is running.
    await waitFor(() => expect(screen.getByTestId('pause-resume-timer')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('pause-resume-timer')).toHaveTextContent('Pause');

    // Pause -> a "Paused" label appears and the remaining time stops changing.
    await fireEvent.press(screen.getByTestId('pause-resume-timer'));
    await waitFor(() => expect(screen.getByTestId('timer-paused-label')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('pause-resume-timer')).toHaveTextContent('Resume');
    // Read the primitive rendered value (not the wrapping React element — comparing two
    // separately-queried React elements with `toEqual` is unreliable: they can carry different
    // internal fiber/`_owner` metadata across renders even when the visible text is identical).
    const pausedValue = screen.getByTestId('timed-remaining').props.children;
    expect(typeof pausedValue).toBe('number');

    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByTestId('timed-remaining').props.children).toBe(pausedValue); // frozen

    // Resume.
    await fireEvent.press(screen.getByTestId('pause-resume-timer'));
    await waitFor(() => expect(screen.queryByTestId('timer-paused-label')).toBeNull(), WAIT_OPTS);

    // End early — first-class button, records ACTUAL seconds held (not the full prescribed 8s).
    await fireEvent.press(screen.getByTestId('end-early'));

    await waitFor(() => {
      const after = sessionsRepo.getSession(db, sessionId)!;
      const setLog = after.entries.find((e) => e.id === entryId)!.setLogs[0];
      expect(setLog).toBeDefined();
      expect(setLog.status).toBe('completed');
      expect(setLog.secondsActual).toBeGreaterThanOrEqual(0);
      expect(setLog.secondsActual).toBeLessThan(8); // ended early — less than the full prescription
      // The pause was recorded as a §8.3 signal too.
      expect(setLog.pauseCount).toBeGreaterThanOrEqual(1);
    }, WAIT_OPTS);
  }, 20000);
});
