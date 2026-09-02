/**
 * Moving around an active workout without training a set: ◂◂ steps back, ▸▸ steps forward.
 *
 * The point of these cases is what does *not* happen — stepping back logs nothing, deletes
 * nothing, and stepping forward again over already-logged sets does not manufacture skips. The
 * §10.8 resume rule stays derived from `set_logs`, so the set counts are the assertion that
 * matters as much as what is on screen.
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
  return { navigate: jest.fn(), replace: jest.fn(), reset: jest.fn(), goBack: jest.fn() };
}

function Setup({ onReady }: { onReady: (db: ReturnType<typeof useStore>['db']) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

type Db = ReturnType<typeof useStore>['db'];

/** A started session, plus every logged set counted so a test can prove nothing moved. */
async function startedSession(seed: string): Promise<{ db: Db; sessionId: string }> {
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
    request: { focus: 'full', effort: 'normal', targetMinutes: 30 },
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
  sessionsRepo.startSession(db, sessionId, nowUtcInstant());
  return { db, sessionId };
}

function loggedSetCount(db: Db, sessionId: string): number {
  const session = sessionsRepo.getSession(db, sessionId)!;
  return session.entries.reduce((n, e) => n + e.setLogs.length, 0);
}

/** Logs the whole first active entry so the front edge sits on the second exercise's first set —
 *  the interesting place to step back from, because ◂◂ has to cross an exercise boundary. */
function completeFirstEntry(db: Db, sessionId: string): { firstName: string; secondName: string } {
  const session = sessionsRepo.getSession(db, sessionId)!;
  const active = session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
  const [first, second] = active;
  for (let i = 0; i < first.sets; i++) {
    sessionsRepo.logSet(
      db,
      {
        entryId: first.id,
        setIndex: i,
        status: 'completed',
        repsPrescribed: first.repTarget ?? undefined,
        secondsPrescribed: first.durationSec ?? undefined,
        repsActual: first.repTarget ?? undefined,
        secondsActual: first.durationSec ?? undefined,
        restPrescribedSec: first.restSec,
      },
      nowUtcInstant(),
    );
  }
  const name = (exerciseId: string) =>
    exerciseLibrary.exercises.find((e) => e.id === exerciseId)?.name ?? exerciseId;
  return { firstName: name(first.exerciseId), secondName: name(second.exerciseId) };
}

function renderWorkout(sessionId: string) {
  render(
    <StoreProvider>
      <WorkoutScreen
        navigation={mockNavigation() as never}
        route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
      />
    </StoreProvider>,
  );
}

describe('stepping back and forward through an active workout', () => {
  it('◂◂ returns to the previous exercise without logging or deleting anything, and ▸▸ comes back', async () => {
    const { db, sessionId } = await startedSession('set-nav-back-seed');
    const { firstName, secondName } = completeFirstEntry(db, sessionId);
    const logsBefore = loggedSetCount(db, sessionId);

    renderWorkout(sessionId);
    await waitFor(() => expect(screen.getByTestId('exercise-name')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('exercise-name').props.children).toBe(secondName);

    // Back onto the last set of the exercise before it.
    fireEvent.press(screen.getByTestId('rewind-set'));
    await waitFor(
      () => expect(screen.getByTestId('exercise-name').props.children).toBe(firstName),
      WAIT_OPTS,
    );
    // Nothing was written to get there, and nothing was thrown away.
    expect(loggedSetCount(db, sessionId)).toBe(logsBefore);

    // Forward again lands back where the workout actually is — and still logs nothing, because
    // the set it stepped over was already logged.
    fireEvent.press(screen.getByTestId('skip-set'));
    await waitFor(
      () => expect(screen.getByTestId('exercise-name').props.children).toBe(secondName),
      WAIT_OPTS,
    );
    expect(loggedSetCount(db, sessionId)).toBe(logsBefore);
  }, 20000);

  it('▸▸ at the front edge is still the skip it always was', async () => {
    const { db, sessionId } = await startedSession('set-nav-skip-seed');
    const logsBefore = loggedSetCount(db, sessionId);

    renderWorkout(sessionId);
    await waitFor(() => expect(screen.getByTestId('skip-set')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByLabelText('Skip this set')).toBeTruthy();

    fireEvent.press(screen.getByTestId('skip-set'));
    await waitFor(() => expect(loggedSetCount(db, sessionId)).toBe(logsBefore + 1), WAIT_OPTS);

    const session = sessionsRepo.getSession(db, sessionId)!;
    const logs = session.entries.flatMap((e) => e.setLogs);
    expect(logs.map((l) => l.status)).toEqual(['skipped']);
  }, 20000);

  it('▸▸ goes straight to the next set — a skipped set earns no rest and is asked for no feedback', async () => {
    const { db, sessionId } = await startedSession('set-nav-skip-no-rest-seed');
    const session = sessionsRepo.getSession(db, sessionId)!;
    const firstEntry = session.entries.find((e) => e.entryStatus !== 'removed_at_approval')!;

    renderWorkout(sessionId);
    await waitFor(() => expect(screen.getByTestId('skip-set')).toBeTruthy(), WAIT_OPTS);

    fireEvent.press(screen.getByTestId('skip-set'));
    await waitFor(() => expect(loggedSetCount(db, sessionId)).toBe(1), WAIT_OPTS);

    // Still on an exercise page, never a rest timer — there is nothing to recover from.
    expect(screen.queryByTestId('rest-circle')).toBeNull();
    expect(screen.getByTestId('exercise-name')).toBeTruthy();

    // And the set it skipped is recorded as skipped, not as one more set that got done.
    const after = sessionsRepo.getSession(db, sessionId)!;
    const log = after.entries.flatMap((e) => e.setLogs)[0]!;
    expect(log.status).toBe('skipped');
    expect(log.repsActual).toBeNull();
    // No feedback was solicited or written for the exercise that was skipped past.
    const afterEntry = after.entries.find((e) => e.id === firstEntry.id)!;
    expect(afterEntry.difficultyFeedback).toBeNull();
    expect(afterEntry.enjoymentFeedback).toBeNull();
  }, 20000);

  it('names its two jobs: skip at the front edge, step forward once stepped back', async () => {
    const { db, sessionId } = await startedSession('set-nav-label-seed');
    completeFirstEntry(db, sessionId);

    renderWorkout(sessionId);
    await waitFor(() => expect(screen.getByTestId('rewind-set')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByLabelText('Skip this set')).toBeTruthy();

    fireEvent.press(screen.getByTestId('rewind-set'));
    await waitFor(
      () => expect(screen.getByLabelText('Go forward to the next set')).toBeTruthy(),
      WAIT_OPTS,
    );
  }, 20000);

  it('offers nothing to step back to on the workout’s very first set', async () => {
    const { sessionId } = await startedSession('set-nav-first-seed');

    renderWorkout(sessionId);
    await waitFor(() => expect(screen.getByTestId('rewind-set')).toBeTruthy(), WAIT_OPTS);
    // Present and named, so the row never reshuffles — just not offering anything yet.
    expect(screen.getByLabelText('Go back to the previous set').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  }, 20000);
});
