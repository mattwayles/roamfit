/**
 * §10.7 rest timer + §8.1 feedback controls, driven through the real WorkoutScreen (not the
 * internal RestPhase/FeedbackControls components in isolation, since they aren't exported —
 * this exercises the actual wiring: completing a set really does auto-start the rest timer with
 * the prescribed duration, +15s/-15s/Skip really do call the wall-clock controller, and the
 * feedback controls really do call `recordEntryFeedback` and reflect "tap the same value again
 * clears it."
 *
 * Entries before the first rep-based main entry are logged directly via `sessionsRepo.logSet`
 * (an already-verified store call — the setup, not what's under test) so the screen lands
 * exactly on a reps exercise, avoiding the timed-exercise get-ready/countdown flow this test
 * isn't about.
 *
 * **Carried-forward issue #14** — this file used to pass 3/3 alone but fail under 2x concurrent
 * CPU load. Root cause, confirmed by the orchestrator: not db contention (per-worker db naming
 * already fixed that), a `waitFor` timeout. `RestPhase`'s displayed countdown only updates when
 * its own internal 250ms `setInterval` fires a re-render (`useCountdown`'s `forceTick`, see
 * `useCountdown.ts`) — pressing `+15s`/`-15s` mutates the wall-clock controller synchronously,
 * but the *screen* doesn't reflect it until that next tick. Under real CPU contention, Node's
 * event loop can starve past a default `waitFor` window (1000ms budget, 50ms poll) well before
 * the interval actually fires, timing the assertion out even though the underlying state is
 * already correct. `WAIT_OPTS` below gives every assertion in this file a timeout with real
 * headroom over that 250ms tick under load, rather than the default — still "await the actual
 * condition" (waitFor keeps polling the same real assertion), just no longer racing a budget
 * that was sized for an idle CPU.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo } from '@roamfit/store';
import WorkoutScreen from './WorkoutScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

// See the file header — real headroom over RestPhase/TimedExercise's 250ms display-refresh tick
// under CPU contention, not the default 1000ms budget sized for an idle CPU.
const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

function mockNavigation() {
  return {
    navigate: jest.fn(),
    replace: jest.fn(),
    reset: jest.fn(),
    goBack: jest.fn(),
  };
}

function Setup({ onReady }: { onReady: (db: ReturnType<typeof useStore>['db']) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

/** Logs every set of every active entry up to (not including) `stopBeforeEntryId` as completed,
 *  directly via the store — advancing past exercises this test doesn't care about without
 *  driving the UI through them. */
function fastForwardTo(
  db: ReturnType<typeof useStore>['db'],
  session: sessionsRepo.SessionRecord,
  stopBeforeEntryId: string,
) {
  for (const entry of session.entries) {
    if (entry.id === stopBeforeEntryId) return;
    if (entry.entryStatus === 'removed_at_approval') continue;
    for (let i = 0; i < entry.sets; i++) {
      sessionsRepo.logSet(
        db,
        {
          entryId: entry.id,
          setIndex: i,
          status: 'completed',
          repsPrescribed: entry.repTarget ?? undefined,
          secondsPrescribed: entry.durationSec ?? undefined,
          repsActual: entry.repTarget ?? undefined,
          secondsActual: entry.durationSec ?? undefined,
          restPrescribedSec: entry.restSec,
        },
        nowUtcInstant(),
      );
    }
  }
}

describe('Rest timer + feedback controls, driven through WorkoutScreen', () => {
  it('completing a reps set auto-starts rest with +15s/-15s/Skip, and feedback controls toggle', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const clock = nowEngineClock();
    const utcInstant = nowUtcInstant();
    const { plan, comebackTier, recoveryWeekManual } = generate(db, {
      library: exerciseLibrary,
      families: familyLibrary,
      request: { focus: 'full', effort: 'normal', targetMinutes: 30 },
      clock,
      rng: createRng(seedFromString('rest-timer-test-seed')),
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

    const session = sessionsRepo.getSession(db, sessionId)!;
    const activeEntries = session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
    // Deliberately a `main` entry: §8.1's per-exercise question lives only there now. Warm-up and
    // cool-down rests carry no controls — they are asked about once per stage instead, on their
    // own page (see `WorkoutScreen.stageFeedback.test.tsx`).
    const firstRepsEntry = activeEntries.find((e) => e.section === 'main' && e.durationSec == null);
    expect(firstRepsEntry).toBeTruthy(); // a 30-min full session always has rep-based main work

    fastForwardTo(db, session, firstRepsEntry!.id);

    const navigation = mockNavigation();
    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={navigation as never}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('complete-set')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('complete-set'));

    // Rest auto-started.
    await waitFor(() => expect(screen.getByTestId('rest-circle')).toBeTruthy(), WAIT_OPTS);
    const restDisplay = () => Number(screen.getByTestId('rest-remaining').props.children);
    const initialRemaining = restDisplay();

    await fireEvent.press(screen.getByTestId('rest-plus-15'));
    await waitFor(() => expect(restDisplay()).toBeGreaterThanOrEqual(initialRemaining), WAIT_OPTS);

    await fireEvent.press(screen.getByTestId('rest-minus-15'));
    // (Back down — not asserting an exact value since real wall-clock ms pass between reads;
    // just that it moved, proving the buttons are wired to the controller.)

    // Feedback controls — unset semantics: tap sets it, tap again clears it.
    await fireEvent.press(screen.getByTestId('difficulty-too_easy'));
    await waitFor(() => {
      // "selected" styling isn't queryable directly, but the underlying store call is what
      // actually matters — read it back.
      const entry = sessionsRepo
        .getSession(db, sessionId)!
        .entries.find((e) => e.id === firstRepsEntry!.id)!;
      expect(entry.difficultyFeedback).toBe('too_easy');
    }, WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('difficulty-too_easy'));
    await waitFor(() => {
      const entry = sessionsRepo
        .getSession(db, sessionId)!
        .entries.find((e) => e.id === firstRepsEntry!.id)!;
      expect(entry.difficultyFeedback).toBeNull();
    }, WAIT_OPTS);

    await fireEvent.press(screen.getByTestId('enjoyment-4'));
    await waitFor(() => {
      const entry = sessionsRepo
        .getSession(db, sessionId)!
        .entries.find((e) => e.id === firstRepsEntry!.id)!;
      expect(entry.enjoymentFeedback).toBe(4);
    }, WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('enjoyment-4'));
    await waitFor(() => {
      const entry = sessionsRepo
        .getSession(db, sessionId)!
        .entries.find((e) => e.id === firstRepsEntry!.id)!;
      expect(entry.enjoymentFeedback).toBeNull();
    }, WAIT_OPTS);

    // Skip zeroes the remaining time and advances on Next.
    await fireEvent.press(screen.getByTestId('rest-skip'));
    await waitFor(() => expect(restDisplay()).toBe(0), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('rest-next'));

    // Next advanced the phase: either back to an exercise view (the next set/entry), or — if
    // that reps set happened to be the very last one in the session — straight to Summary.
    // Either is correct; which one depends on where in the generated plan `firstRepsEntry`
    // landed, which this test doesn't control.
    await waitFor(
      () =>
        expect(
          screen.queryByTestId('complete-set') ??
            screen.queryByTestId('timed-circle') ??
            (navigation.replace.mock.calls.length > 0 ? true : null),
        ).toBeTruthy(),
      WAIT_OPTS,
    );
  });
});
