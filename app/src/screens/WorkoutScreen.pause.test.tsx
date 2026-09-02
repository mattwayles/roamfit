/**
 * §10.4/§10.8 — pause an active workout. Distinct from the per-set pause on the ring (§10.5)
 * control tested in `WorkoutScreen.timedBilateral.test.tsx`: this is the workout-level Pause.
 *
 * It used to navigate to Home as well as pausing, which conflated two different intentions —
 * "stop the clock for a minute" and "I am done looking at this screen". It now only pauses, and
 * the same button resumes.
 *
 * Two things it also used to get wrong, both covered below: the elapsed clock kept running while
 * "paused" (it was `now - startedAt`, with nothing to subtract), and the whole active subtree was
 * unmounted, which stopped the timers by taking the workout off screen — so a paused user could
 * not read, review or edit the session they were standing in the middle of.
 *
 * What Jest can and can't prove here (per the request to be honest about it): this proves the
 * in-progress set is never logged/lost when the user pauses mid-timer, that the countdown and the
 * elapsed display both actually freeze, that the pause is read back from the session on a fresh
 * mount rather than living in component state, and that completing a set against a stopped clock
 * asks before logging. It does NOT prove a physical device actually silences a rest-timer beep or
 * cancels an OS notification banner — that class of evidence needs a real device, same caveat
 * class as carried-forward issue #16.
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

describe('§10.4/§10.8 pause an active workout', () => {
  it('pausing mid-timer stops the phase engine in place, never logs the in-progress set, and resumes on the same button', async () => {
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
    await fireEvent.press(screen.getByTestId('timed-circle'));

    // Wait for the hold itself to actually be running (past the 3s get-ready) — pausing during
    // the real countdown, not before it started, is the scenario that risks a premature
    // completion if the phase-engine interval kept ticking past this point.
    await waitFor(
      () => expect(screen.getByTestId('timed-caption')).toHaveTextContent('Tap to pause'),
      WAIT_OPTS,
    );

    // Workout-level Pause (the session clock), not the ring's own per-set pause.
    expect(screen.getByTestId('pause-workout')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pause-workout'));

    // Pausing keeps you on the workout — it stops the clock, it does not leave the screen.
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
    await waitFor(
      () => expect(screen.getByTestId('workout-paused-banner')).toBeTruthy(),
      WAIT_OPTS,
    );
    // The workout itself stays on screen and stays usable — pausing stops the clock, it does not
    // put the session away. (An earlier pass unmounted this subtree, which did stop the phase
    // engine but took the exercise, the band picker and the swap/skip controls with it.)
    expect(screen.getByTestId('timed-circle')).toBeTruthy();
    expect(screen.getByTestId('swap-set')).toBeTruthy();
    expect(screen.getByTestId('skip-set')).toBeTruthy();
    const frozenAt = screen.getByTestId('timed-remaining').props.children;

    // Wait past the full prescribed duration (3s) plus headroom — long enough that, if pausing
    // had NOT actually stopped the phase engine, the timed exercise would have auto-completed
    // and logged a set by now.
    await new Promise((r) => setTimeout(r, 3500));

    const afterPause = sessionsRepo.getSession(db, sessionId)!;
    const entry = afterPause.entries.find((e) => e.id === entryId)!;
    expect(entry.setLogs).toHaveLength(0);
    // ...and the countdown has not moved a second in all that time.
    expect(screen.getByTestId('timed-remaining').props.children).toEqual(frozenAt);

    // §10.10 — the session is still active/pending, not discarded.
    expect(sessionsRepo.getPendingSession(db)?.id).toBe(sessionId);

    // The same control resumes, and the hold picks up where it was frozen rather than restarting.
    await fireEvent.press(screen.getByTestId('pause-workout'));
    await waitFor(
      () => expect(screen.queryByTestId('workout-paused-banner')).toBeNull(),
      WAIT_OPTS,
    );
    // Back on a live hold, not reset to the un-started state.
    expect(screen.getByTestId('timed-caption')).not.toHaveTextContent('Tap to start');
  }, 20000);

  it('a pause survives leaving the screen, because it lives on the session and not in component state', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const { sessionId } = await setUpTimedEntry(db, 'pause-persist-seed', {
      durationSec: 30,
      unilateral: false,
    });

    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={mockNavigation() as never}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('pause-workout')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('pause-workout'));
    await waitFor(
      () => expect(screen.getByTestId('workout-paused-banner')).toBeTruthy(),
      WAIT_OPTS,
    );
    // Home's resume card brings the user back to a fresh mount of this screen. Rendered as a
    // second tree rather than after an unmount — `cleanup()` mid-test aborts the harness's pending
    // waits — and `screen` then addresses the newest tree, so what follows is asserted against the
    // fresh mount alone. It shows the pause because it read it back off the session; the old
    // component-state version had nothing to read, and silently restarted the clock here.
    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={mockNavigation() as never}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );
    await waitFor(
      () => expect(screen.getByTestId('workout-paused-banner')).toBeTruthy(),
      WAIT_OPTS,
    );
  }, 20000);

  it('stops the elapsed clock — the whole point of the button, and what it used not to do', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const { sessionId } = await setUpTimedEntry(db, 'pause-elapsed-frozen-seed', {
      durationSec: 30,
      unilateral: false,
    });
    // Backdated so the display starts at a legible, non-zero value.
    sessionsRepo.startSession(db, sessionId, new Date(Date.now() - 5 * 60_000).toISOString());

    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={mockNavigation() as never}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('pause-workout')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('pause-workout'));
    await waitFor(
      () => expect(screen.getByTestId('workout-paused-banner')).toBeTruthy(),
      WAIT_OPTS,
    );

    const frozen = screen.getByTestId('workout-elapsed').props.children.join('');
    // The screen re-renders once a second, so several ticks pass in here. Before this fix the
    // display was `now - startedAt` with nothing subtracted, and would have moved every one.
    await new Promise((r) => setTimeout(r, 2500));
    expect(screen.getByTestId('workout-elapsed').props.children.join('')).toBe(frozen);
  }, 20000);

  it('completing a set while paused asks about the timer first, and logs the set either way', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const { sessionId, entryId } = await setUpTimedEntry(db, 'pause-nudge-seed', {
      durationSec: 30,
      unilateral: false,
    });

    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={mockNavigation() as never}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('timed-circle')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('timed-circle'));
    await waitFor(
      () => expect(screen.getByTestId('timed-caption')).toHaveTextContent('Tap to pause'),
      WAIT_OPTS,
    );
    await fireEvent.press(screen.getByTestId('pause-workout'));
    await waitFor(
      () => expect(screen.getByTestId('workout-paused-banner')).toBeTruthy(),
      WAIT_OPTS,
    );

    // Ending the set against a stopped clock raises the nudge instead of logging silently. Ending
    // early is a long press on the ring now, and is still reachable while the clock is stopped.
    await fireEvent(screen.getByTestId('timed-circle'), 'longPress');
    await waitFor(
      () => expect(screen.getByTestId('paused-completion-nudge')).toBeTruthy(),
      WAIT_OPTS,
    );
    expect(
      sessionsRepo.getSession(db, sessionId)!.entries.find((e) => e.id === entryId)!.setLogs,
    ).toHaveLength(0);

    await fireEvent.press(screen.getByTestId('paused-completion-resume'));

    // The set the user had already earned is logged, and the clock is running again.
    await waitFor(() => {
      const entry = sessionsRepo.getSession(db, sessionId)!.entries.find((e) => e.id === entryId)!;
      expect(entry.setLogs).toHaveLength(1);
    }, WAIT_OPTS);
    expect(sessionsRepo.getSession(db, sessionId)!.pausedAt).toBeNull();
    expect(screen.queryByTestId('paused-completion-nudge')).toBeNull();
  }, 20000);

  it('“stay paused” is a real answer: the set is still logged and the clock stays stopped', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const { sessionId, entryId } = await setUpTimedEntry(db, 'pause-nudge-stay-seed', {
      durationSec: 30,
      unilateral: false,
    });

    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={mockNavigation() as never}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('timed-circle')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('timed-circle'));
    await waitFor(
      () => expect(screen.getByTestId('timed-caption')).toHaveTextContent('Tap to pause'),
      WAIT_OPTS,
    );
    await fireEvent.press(screen.getByTestId('pause-workout'));
    await waitFor(
      () => expect(screen.getByTestId('workout-paused-banner')).toBeTruthy(),
      WAIT_OPTS,
    );
    // Ending early is a long press on the ring now — still reachable while the session clock is
    // stopped, which is the whole point of this test.
    await fireEvent(screen.getByTestId('timed-circle'), 'longPress');
    await waitFor(
      () => expect(screen.getByTestId('paused-completion-nudge')).toBeTruthy(),
      WAIT_OPTS,
    );

    await fireEvent.press(screen.getByTestId('paused-completion-stay-paused'));

    await waitFor(() => {
      const entry = sessionsRepo.getSession(db, sessionId)!.entries.find((e) => e.id === entryId)!;
      expect(entry.setLogs).toHaveLength(1);
    }, WAIT_OPTS);
    expect(sessionsRepo.getSession(db, sessionId)!.pausedAt).not.toBeNull();
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
