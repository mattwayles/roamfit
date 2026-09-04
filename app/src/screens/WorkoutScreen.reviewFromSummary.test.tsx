/**
 * Returning to an active workout from Summary, before FINISH is tapped. The session is fully
 * logged at this point (frontier is null), which is exactly the state the ordinary auto-navigate
 * effect reads as "done, go to Summary" — `reviewFromSummary` has to suppress that, land on the
 * last set instead of the front edge, and offer an explicit way back out, since ▸▸ dead-ends with
 * no front edge to walk forward to.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo } from '@roamfit/store';
import WorkoutScreen from './WorkoutScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

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

type Db = ReturnType<typeof useStore>['db'];

/** A started session with every set logged — the shape the workout is in the moment it hands off
 *  to Summary, before FINISH has run. */
async function fullyLoggedSession(
  seed: string,
): Promise<{ db: Db; sessionId: string; lastName: string }> {
  let db!: Db;
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
    rng: createRng(seedFromString(seed)),
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
  sessionsRepo.startSession(db, sessionId, utcInstant);

  const session = sessionsRepo.getSession(db, sessionId)!;
  const active = session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
  for (const entry of active) {
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
        utcInstant,
      );
    }
  }
  const last = active[active.length - 1]!;
  const lastName =
    exerciseLibrary.exercises.find((e) => e.id === last.exerciseId)?.name ?? last.exerciseId;
  // The cool-down stage question is what actually ends the workout — answer it so the session
  // is genuinely at the "everything logged, nothing left to ask" state Summary itself would see.
  sessionsRepo.recordSectionFeedback(db, sessionId, 'cooldown', { enjoyment: 4 }, utcInstant);
  return { db, sessionId, lastName };
}

describe('reviewFromSummary: coming back to a fully-logged, not-yet-FINISHed workout', () => {
  it('lands on the last set instead of bouncing straight back to Summary', async () => {
    const { sessionId, lastName } = await fullyLoggedSession('review-land-seed');
    const navigation = mockNavigation();

    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={navigation as never}
          route={
            {
              key: 'Workout',
              name: 'Workout',
              params: { sessionId, reviewFromSummary: true },
            } as never
          }
        />
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('exercise-name')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('exercise-name').props.children).toBe(lastName);
    // The auto-navigate-to-Summary effect must not have fired — that would defeat the point of
    // coming back at all.
    expect(navigation.replace).not.toHaveBeenCalled();
  }, 20000);

  it('offers an explicit way back to Summary, since there is no front edge for ▸▸ to reach', async () => {
    const { sessionId } = await fullyLoggedSession('review-done-seed');
    const navigation = mockNavigation();

    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={navigation as never}
          route={
            {
              key: 'Workout',
              name: 'Workout',
              params: { sessionId, reviewFromSummary: true },
            } as never
          }
        />
      </StoreProvider>,
    );

    await waitFor(() => expect(navigation.setOptions).toHaveBeenCalled(), WAIT_OPTS);
    const { headerRight } = navigation.setOptions.mock.calls.at(-1)![0];
    const headerView = await render(headerRight());

    fireEvent.press(headerView.getByTestId('review-done'));
    expect(navigation.replace).toHaveBeenCalledWith('Summary', { sessionId });
  }, 20000);

  it('without reviewFromSummary, the ordinary behavior is unchanged — straight to Summary', async () => {
    const { sessionId } = await fullyLoggedSession('review-control-seed');
    const navigation = mockNavigation();

    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={navigation as never}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );

    await waitFor(
      () => expect(navigation.replace).toHaveBeenCalledWith('Summary', { sessionId }),
      WAIT_OPTS,
    );
  }, 20000);
});
