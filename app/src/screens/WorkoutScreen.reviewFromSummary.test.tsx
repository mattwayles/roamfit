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

describe('jumpTo: landing on an explicit bookmark from a tap in Summary', () => {
  it('lands on the given (entry, set) — not the front edge, and not the last set either', async () => {
    const { db, sessionId } = await fullyLoggedSession('jumpto-land-seed');
    const session = sessionsRepo.getSession(db, sessionId)!;
    const active = session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
    const first = active[0]!;
    const firstName =
      exerciseLibrary.exercises.find((e) => e.id === first.exerciseId)?.name ?? first.exerciseId;
    const navigation = mockNavigation();

    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={navigation as never}
          route={
            {
              key: 'Workout',
              name: 'Workout',
              params: { sessionId, jumpTo: { entryId: first.id, setIndex: 0 } },
            } as never
          }
        />
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('exercise-name')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('exercise-name').props.children).toBe(firstName);
    expect(screen.getByText(`Set 1 of ${first.sets}`)).toBeTruthy();
    // The auto-navigate-to-Summary effect must not have fired — jumpTo suppresses it exactly like
    // reviewFromSummary does, since the front edge is null (everything is already logged) here too.
    expect(navigation.replace).not.toHaveBeenCalled();
  }, 20000);

  it('an invalid bookmark (entry no longer in the plan) is ignored, falling back to ordinary behavior', async () => {
    const { sessionId } = await fullyLoggedSession('jumpto-invalid-seed');
    const navigation = mockNavigation();

    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={navigation as never}
          route={
            {
              key: 'Workout',
              name: 'Workout',
              params: { sessionId, jumpTo: { entryId: 'no-such-entry', setIndex: 0 } },
            } as never
          }
        />
      </StoreProvider>,
    );

    // Falls through to the ordinary "everything logged, nothing to jump to" behavior.
    await waitFor(
      () => expect(navigation.replace).toHaveBeenCalledWith('Summary', { sessionId }),
      WAIT_OPTS,
    );
  }, 20000);
});

describe('the "Progress" header button — a real-time way to view the summary from any page', () => {
  it('in review mode, only "Done" is offered — a separate "Progress" button would do the same thing', async () => {
    const { sessionId } = await fullyLoggedSession('progress-button-review-seed');
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

    expect(headerView.queryByTestId('view-progress')).toBeNull();
    expect(headerView.getByTestId('review-done')).toBeTruthy();
  }, 20000);

  it('outside review mode, a persistent "Progress" button replaces to Summary — available on any page of the active workout', async () => {
    let db!: Db;
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    // A freshly started, not-yet-logged session — the ordinary mid-workout state the button
    // exists to be reachable from.
    const clock = nowEngineClock();
    const utcInstant = nowUtcInstant();
    const { plan, comebackTier, recoveryWeekManual } = generate(db, {
      library: exerciseLibrary,
      families: familyLibrary,
      request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
      clock,
      rng: createRng(seedFromString('progress-button-live-seed')),
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
    const { headerRight } = navigation.setOptions.mock.calls.at(-1)![0];
    const headerView = await render(headerRight());

    fireEvent.press(headerView.getByTestId('view-progress'));
    expect(navigation.replace).toHaveBeenCalledWith('Summary', { sessionId });
  }, 20000);
});
