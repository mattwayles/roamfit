/**
 * §10.4/§10.8 — "pause an active workout and navigate away" (real device-testing request).
 * Distinct from the existing per-set `pause-resume-timer` (§10.5) control tested in
 * `WorkoutScreen.timedBilateral.test.tsx` — this is the workout-level "Pause" action that leaves
 * the screen entirely.
 *
 * What Jest can and can't prove here (per the request to be honest about it): this proves the
 * in-progress set is never logged/lost when the user pauses mid-timer, that the session stays
 * resumable at exactly the same set on a fresh mount (crash-safety mechanism reused, not
 * reinvented), and that the elapsed-workout display survives an unmount/remount correctly
 * (derived from the persisted `startedAt`, not a component-local stopwatch that resets). It does
 * NOT prove a physical device actually silences a rest-timer beep or cancels an OS notification
 * banner mid-transition — that class of evidence needs a real device, same caveat class as
 * carried-forward issue #16.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { sessionsRepo } from '@roamfit/store';
import WorkoutScreen from './WorkoutScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { setUpTimedEntry } from './timedTestHelpers';

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

describe('§10.4/§10.8 pause an active workout and navigate away', () => {
  it('pausing mid-timer navigates to Home, unmounts the active phase, and never logs the in-progress set', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    // A short, controlled timed entry — same helper the §10.5 interaction tests use.
    const { sessionId, entryId } = await setUpTimedEntry(db, 'pause-test-seed', {
      durationSec: 3,
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
    await fireEvent.press(screen.getByTestId('start-timer'));

    // Wait for the hold itself to actually be running (past the 3s get-ready) — pausing during
    // the real countdown, not before it started, is the scenario that risks a premature
    // completion if the phase-engine interval kept ticking past this point.
    await waitFor(() => expect(screen.getByTestId('pause-resume-timer')).toBeTruthy(), WAIT_OPTS);

    // Workout-level Pause (not the per-set pause-resume-timer button).
    expect(screen.getByTestId('pause-workout')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pause-workout'));

    expect(navigation.navigate).toHaveBeenCalledWith('Home');
    // The active phase subtree is gone — this is what actually stops the phase engine, not a
    // "paused" label sitting on top of a still-ticking timer.
    expect(screen.queryByTestId('timed-circle')).toBeNull();

    // Wait past the full prescribed duration (3s) plus headroom — long enough that, if pausing
    // had NOT actually stopped the phase engine, the timed exercise would have auto-completed
    // and logged a set by now.
    await new Promise((r) => setTimeout(r, 3500));

    const afterPause = sessionsRepo.getSession(db, sessionId)!;
    const entry = afterPause.entries.find((e) => e.id === entryId)!;
    expect(entry.setLogs).toHaveLength(0);

    // §10.10 — the session is still active/pending, not discarded. Resuming (a fresh mount, the
    // same mechanism `WorkoutScreen.resume.test.tsx` proves for a force-quit) lands on the exact
    // same set.
    expect(sessionsRepo.getPendingSession(db)?.id).toBe(sessionId);

    const resumeNav = mockNavigation();
    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={resumeNav as never}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );
    await waitFor(() => expect(screen.getAllByTestId('timed-circle').length).toBeGreaterThan(0), WAIT_OPTS);
    // Never auto-starts on resume either.
    expect(screen.getAllByTestId('timed-remaining')[0]).toHaveTextContent('Tap to start');
  }, 20000);

  it('the elapsed-workout display is derived from the persisted session start, not a component-local timer that resets on remount', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const { sessionId } = await setUpTimedEntry(db, 'pause-elapsed-test-seed', {
      durationSec: 30,
      unilateral: false,
    });

    // Simulate the session having actually started several minutes ago (e.g. the user paused
    // and came back later) by backdating `startedAt` directly — the store's own field, not a
    // parallel timestamp invented here.
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    sessionsRepo.startSession(db, sessionId, fiveMinutesAgo);

    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={mockNavigation() as never}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );

    // A component-local stopwatch that starts counting from mount time would show "Elapsed 0m
    // 0s" (or a few seconds at most) here. The fix reads real elapsed time since the persisted
    // `startedAt`, so it should show ~5 minutes immediately, on the very first render — not
    // after waiting out several 1s ticks.
    await waitFor(() => {
      const text = screen.getByTestId('workout-elapsed').props.children.join('');
      expect(text).toMatch(/Elapsed 5m/);
    }, WAIT_OPTS);
  }, 20000);
});
