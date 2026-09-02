/**
 * §10.3 re-order at approval, driven through the real ApprovalScreen — and, critically, proving
 * the round trip: the new order survives through `@roamfit/store` into WorkoutScreen's real
 * `findCurrent()` resume logic (§10.8's crash-safety scan, walking `session.entries` in plan
 * order). A test that only checks the store's own `orderIndex` column wouldn't prove the Workout
 * screen actually *runs* the user's order — this one does, by rendering WorkoutScreen for real
 * after the reorder and reading which exercise it lands on first.
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo } from '@roamfit/store';
import ApprovalScreen, { ESTIMATED_CARD_HEIGHT } from './ApprovalScreen';
import WorkoutScreen from './WorkoutScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

function mockNavigation() {
  return { navigate: jest.fn(), replace: jest.fn(), reset: jest.fn(), goBack: jest.fn() };
}

function Setup({ onReady }: { onReady: (db: ReturnType<typeof useStore>['db']) => void }) {
  const { db } = useStore();
  // Side effects must not run in the render phase: calling `onReady` (and mutating the db)
  // inline re-fires on every render and can spin forever. This test hung indefinitely before
  // the effect wrapper was added.
  React.useEffect(() => {
    const pending = sessionsRepo.getPendingSession(db);
    if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
    onReady(db);
  }, [db, onReady]);
  return null;
}

async function createPendingSession(db: ReturnType<typeof useStore>['db']): Promise<string> {
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', effort: 'normal', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString('approval-reorder-test-seed')),
    utcInstant,
  });
  return sessionsRepo.createPendingSession(db, {
    plan,
    utcInstant,
    localDate: clock.today,
    tzId: clock.tzId,
    comebackTier,
    recoveryWeekManual,
  });
}

describe('§10.3 re-order at approval, driven through ApprovalScreen', () => {
  it('moving a main exercise up persists and Workout runs the new order, not the generated one', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const sessionId = await createPendingSession(db);
    const before = sessionsRepo.getSession(db, sessionId)!;
    const mainEntries = before.entries.filter(
      (e) => e.section === 'main' && e.entryStatus !== 'removed_at_approval',
    );
    expect(mainEntries.length).toBeGreaterThanOrEqual(2);
    const originalFirst = mainEntries[0];
    const originalSecond = mainEntries[1];

    const navigation = mockNavigation();
    const approvalRender = await render(
      <StoreProvider>
        <NavigationContainer>
          <ApprovalScreen
            navigation={navigation as never}
            route={{ key: 'Approval', name: 'Approval', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('start-button')).toBeTruthy(), WAIT_OPTS);

    // Drag the second main exercise up one slot — it should become the new first. The ▲/▼
    // buttons this replaced were two extra controls on an already-overcrowded row; on a phone a
    // drag says the same thing directly. PanResponder surfaces as responder events, so that is
    // what a drag looks like from a test's point of view.
    // The handle's props come straight from `PanResponder.panHandlers`, so calling them is
    // exercising the real wiring. Driven directly rather than through `fireEvent` because RNTL's
    // event-name mapping does not reach `onResponderGrant`/`onResponderMove` — it silently fires
    // nothing, which would make this test pass for the wrong reason.
    const handle = screen.getByTestId(`drag-handle-${originalSecond.exerciseId}`);
    // Cards size themselves to their content and report the result via onLayout; RNTL never lays
    // anything out, so the drag falls back to ESTIMATED_CARD_HEIGHT. Travelling a full card plus
    // its gap is comfortably past the half-card threshold that triggers a swap.
    const startY = 500;
    const travel = ESTIMATED_CARD_HEIGHT + 8;
    await act(async () => {
      handle.props.onResponderGrant({ nativeEvent: { pageY: startY } });
    });
    await act(async () => {
      handle.props.onResponderMove({ nativeEvent: { pageY: startY - travel } });
    });
    await act(async () => {
      handle.props.onResponderRelease({ nativeEvent: { pageY: startY - travel } });
    });

    await waitFor(() => {
      const after = sessionsRepo
        .getSession(db, sessionId)!
        .entries.filter((e) => e.section === 'main' && e.entryStatus !== 'removed_at_approval');
      expect(after[0].id).toBe(originalSecond.id);
      expect(after[1].id).toBe(originalFirst.id);
    }, WAIT_OPTS);

    // Warmup section is untouched by a main-section move (§10.3 constraint: never crosses
    // sections).
    const warmupAfter = sessionsRepo
      .getSession(db, sessionId)!
      .entries.filter((e) => e.section === 'warmup');
    const warmupBefore = before.entries.filter((e) => e.section === 'warmup');
    expect(warmupAfter.map((e) => e.id)).toEqual(warmupBefore.map((e) => e.id));

    // --- Round trip: start the session and see what WorkoutScreen actually runs first --------
    await fireEvent.press(screen.getByTestId('start-button'));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('Workout', { sessionId }));
    // The mock navigation doesn't actually unmount ApprovalScreen (that's react-navigation's
    // job in the real app) — do it explicitly so only one screen's tree exists to query against
    // once WorkoutScreen mounts below.
    approvalRender.unmount();

    // Nothing has been logged yet, so `findCurrent()` would land on warmup first (it walks
    // warmup -> main -> cooldown in plan order) — fast-forward warmup *before* mounting
    // WorkoutScreen at all, so there is only ever one render tree to query against (mirrors the
    // `fastForwardTo` helper the timed-exercise tests use, inlined here since it only needs to
    // stop at "end of warmup" rather than a specific entry id).
    const session = sessionsRepo.getSession(db, sessionId)!;
    for (const entry of session.entries) {
      if (entry.section !== 'warmup' || entry.entryStatus === 'removed_at_approval') continue;
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

    const workoutNav = mockNavigation();
    render(
      <StoreProvider>
        <NavigationContainer>
          <WorkoutScreen
            navigation={workoutNav as never}
            route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );

    // The exercise name shown on the hero should be the reordered-to-first main exercise
    // (`originalSecond`), never the engine's original first pick.
    const originalFirstName =
      exerciseLibrary.exercises.find((e) => e.id === originalFirst.exerciseId)?.name ??
      originalFirst.exerciseId;
    const originalSecondName =
      exerciseLibrary.exercises.find((e) => e.id === originalSecond.exerciseId)?.name ??
      originalSecond.exerciseId;

    await waitFor(() => {
      expect(screen.queryByText(originalSecondName)).toBeTruthy();
      expect(screen.queryByText(originalFirstName)).toBeNull();
    }, WAIT_OPTS);
  }, 20000);
});
