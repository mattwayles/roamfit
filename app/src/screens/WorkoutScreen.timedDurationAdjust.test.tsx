/**
 * The ±5s buttons flanking the "tap to start" ring on a timed exercise — added from device
 * feedback that the target rep count picker on the reps hero had no timed counterpart: there was
 * no way to shorten or lengthen a hold before starting it short of swapping the exercise.
 *
 * Two things worth a dedicated test: the buttons are pre-start only and floor at 5s (fast, no
 * real waiting), and the adjustment is not just cosmetic — it is what the countdown actually
 * counts down from and what gets logged (real wall-clock timers, same approach
 * `WorkoutScreen.timedBilateral.test.tsx` uses).
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
// The 3s get-ready + 5s adjusted hold in the second test exceeds the default budget above; same
// generous headroom `WorkoutScreen.timedUnilateral.test.tsx` uses for its own stacked real timers.
const LONG_WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 15000, interval: 50 };

function Setup({ onReady }: { onReady: (db: ReturnType<typeof useStore>['db']) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

describe('§10.5 timed exercise duration adjust, driven through WorkoutScreen', () => {
  it('±5s buttons adjust the pre-start target, floor at 5s, and disappear once started', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const { sessionId } = await setUpTimedEntry(db, 'timed-duration-adjust-seed', {
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

    await waitFor(() => expect(screen.getByTestId('timed-circle')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('timed-remaining')).toHaveTextContent('10');

    // -5s once lands exactly on the 5s floor.
    await fireEvent.press(screen.getByTestId('duration-minus'));
    expect(screen.getByTestId('timed-remaining')).toHaveTextContent('5');

    // A second -5s would go negative — clamped at the floor instead.
    await fireEvent.press(screen.getByTestId('duration-minus'));
    expect(screen.getByTestId('timed-remaining')).toHaveTextContent('5');

    // +5s brings it back up.
    await fireEvent.press(screen.getByTestId('duration-plus'));
    expect(screen.getByTestId('timed-remaining')).toHaveTextContent('10');

    // Once the hold starts, the ring is the only control left — the adjust buttons are gone.
    await fireEvent.press(screen.getByTestId('timed-circle'));
    await waitFor(() => expect(screen.queryByTestId('duration-minus')).toBeNull(), WAIT_OPTS);
    expect(screen.queryByTestId('duration-plus')).toBeNull();
  });

  it('the adjusted target is what the hold actually counts down and logs, not the original prescription', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    // 10s prescribed, cut to the 5s floor before starting — so a natural (non-"end early")
    // completion should log 5s, never the original 10.
    const { sessionId, entryId } = await setUpTimedEntry(db, 'timed-duration-adjust-run-seed', {
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

    await waitFor(() => expect(screen.getByTestId('timed-circle')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('duration-minus'));
    expect(screen.getByTestId('timed-remaining')).toHaveTextContent('5');

    await fireEvent.press(screen.getByTestId('timed-circle'));

    // 3s get-ready, then the hold itself starts at the adjusted 5s — never at the original 10s.
    await waitFor(
      () => expect(screen.getByTestId('timed-caption')).toHaveTextContent('Tap to pause'),
      WAIT_OPTS,
    );
    const holdStartValue = screen.getByTestId('timed-remaining').props.children;
    expect(holdStartValue).toBeLessThanOrEqual(5);

    // Let the 5s hold run out on its own and auto-advance to rest, rather than ending early.
    await waitFor(() => expect(screen.getByTestId('rest-circle')).toBeTruthy(), LONG_WAIT_OPTS);

    const after = sessionsRepo.getSession(db, sessionId)!;
    const setLog = after.entries.find((e) => e.id === entryId)!.setLogs[0];
    expect(setLog.status).toBe('completed');
    expect(setLog.secondsActual).toBe(5);
  }, 20000);

  it('labels the number with its unit — "sec" under a minute, "min" and M:SS at or past one', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const { sessionId } = await setUpTimedEntry(db, 'timed-duration-adjust-unit-seed', {
      durationSec: 55,
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
    expect(screen.getByTestId('timed-remaining')).toHaveTextContent('55');
    expect(screen.getByTestId('timed-remaining-unit')).toHaveTextContent('sec');

    // Crossing the one-minute mark switches the number itself to M:SS and the unit to "min" — a
    // bare "60" is harder to place at a glance than a plain "60 sec" would already have been, so
    // this only kicks in once the seconds display would otherwise get genuinely large.
    await fireEvent.press(screen.getByTestId('duration-plus'));
    expect(screen.getByTestId('timed-remaining')).toHaveTextContent('1:00');
    expect(screen.getByTestId('timed-remaining-unit')).toHaveTextContent('min');

    // Get-ready and switch-side interstitials are always a couple of seconds and already say
    // what they are in the caption below — no unit label competing for space on those.
    await fireEvent.press(screen.getByTestId('timed-circle'));
    await waitFor(
      () => expect(screen.getByTestId('timed-caption')).toHaveTextContent('Get ready'),
      WAIT_OPTS,
    );
    expect(screen.queryByTestId('timed-remaining-unit')).toBeNull();
  });
});
