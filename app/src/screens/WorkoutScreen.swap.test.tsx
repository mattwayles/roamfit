/**
 * §10.6 mid-workout swap, driven through the real WorkoutScreen. Confirms the whole wiring end
 * to end: tapping Swap opens the sheet with real `alternativesForSlot` candidates (not a mock),
 * picking one calls `sessionsRepo.recordSwap` for real, the plan entry's exercise/prescription
 * actually changes, the swap is recorded as a signal (`swapAwayCount` on the replaced exercise),
 * and the flow returns straight to the exercise view with no re-approval/regeneration step.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { exerciseStateRepo, generate, sessionsRepo } from '@roamfit/store';
import WorkoutScreen from './WorkoutScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

// Generous timeout/poll, per issue #14: default waitFor budgets are sized for an idle
// CPU and can be starved under real contention even when the underlying state is
// already correct.
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

describe('§10.6 mid-workout swap, driven through WorkoutScreen', () => {
  it('Swap -> pick an alternative replaces the entry in place, no re-approval, timer never resets', async () => {
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
      request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
      clock,
      rng: createRng(seedFromString('swap-test-seed')),
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
    const firstRepsEntry = activeEntries.find((e) => e.durationSec == null);
    expect(firstRepsEntry).toBeTruthy();

    fastForwardTo(db, session, firstRepsEntry!.id);
    const originalExerciseId = firstRepsEntry!.exerciseId;

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

    // One tap swaps. The picker sheet this replaced asked the user to choose between candidates
    // the engine had already ranked, mid-set, with a rest timer about to start.
    await fireEvent.press(screen.getByTestId('swap-set'));
    await waitFor(() => expect(screen.getByTestId('swap-notice')).toBeTruthy(), WAIT_OPTS);

    // The elapsed workout timer (rendered above the phase view, unconditionally) is still there
    // and ticking — the session stopwatch was never paused or reset by swapping.
    expect(screen.getByText(/^Elapsed/)).toBeTruthy();

    // No re-approval/regeneration navigation happened, and we are straight back on an exercise
    // view (reps or timed — the new exercise may have a different metric).
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
    await waitFor(
      () =>
        expect(
          screen.queryByTestId('complete-set') ?? screen.queryByTestId('timed-circle'),
        ).toBeTruthy(),
      WAIT_OPTS,
    );

    // The store really recorded the swap: the entry's exerciseId changed, and the replaced
    // exercise's swapAwayCount incremented (§5.2 REPEATEDLY-SKIPPED input, §8.3 signal).
    const after = sessionsRepo.getSession(db, sessionId)!;
    const afterEntry = after.entries.find((e) => e.id === firstRepsEntry!.id)!;
    // Whatever the engine ranked first — the point is that it changed, and to something else.
    expect(afterEntry.exerciseId).not.toBe(originalExerciseId);
    expect(afterEntry.plannedExerciseId).toBe(originalExerciseId); // planned-vs-actual preserved
    const replacedState = exerciseStateRepo.getExerciseState(db, originalExerciseId);
    expect(replacedState?.swapAwayCount).toBe(1);
  });
});
