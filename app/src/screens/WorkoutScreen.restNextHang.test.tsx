/**
 * User-reported: after the final cool-down's rest timer, the app "just spins forever and never
 * proceeds to the workout summary page." Root cause: `RestPhase`'s `handleNext` awaited
 * `cancelRestNotification` (a native `expo-notifications` call) before calling `onNext()` — a
 * best-effort background cleanup (see `workoutNotifications.ts`'s own header) gating the one
 * action that has to work regardless. `expo-notifications` has a documented history in this repo
 * of hanging/leaking under load (STATUS-4b, issue #14); by the last rest of a real workout, many
 * schedule/cancel cycles have already run, making a stuck native promise far more likely than on
 * an early rest — which is exactly why this surfaced specifically on the *final* cooldown rest.
 *
 * This test never lets `cancelRestNotification` resolve, and asserts Next still gets you to
 * Summary — the actual regression, independent of *why* the native call might hang on-device.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { eq } from 'drizzle-orm';
import { generate, schema, sessionsRepo } from '@roamfit/store';
import type { Db } from '@roamfit/store';
import WorkoutScreen from './WorkoutScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

jest.mock('../lib/workoutNotifications', () => ({
  ensureNotificationPermission: jest.fn().mockResolvedValue(undefined),
  scheduleRestZeroNotification: jest.fn().mockResolvedValue(null),
  // Never resolves — simulates the native call hanging, which is the actual failure mode being
  // guarded against here.
  cancelRestNotification: jest.fn(() => new Promise(() => {})),
}));

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

function Setup({ onReady }: { onReady: (db: Db) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

function activeEntries(session: sessionsRepo.SessionRecord) {
  return session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
}

/** A started session parked on the very last set of the whole plan, everything before it logged,
 *  forced to reps so completing it doesn't need to wait out a real countdown. */
async function sessionAtVeryLastSet(db: Db, seed: string) {
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', difficulty: 'medium', targetMinutes: 60 },
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

  const preSession = sessionsRepo.getSession(db, sessionId)!;
  const preEntries = activeEntries(preSession);
  const lastEntryId = preEntries[preEntries.length - 1]!.id;
  db.update(schema.sessionEntries)
    .set({ durationSec: null, repTarget: 10, unilateral: false, sets: 1 })
    .where(eq(schema.sessionEntries.id, lastEntryId))
    .run();

  const session = sessionsRepo.getSession(db, sessionId)!;
  const entries = activeEntries(session);
  const lastEntry = entries.find((e) => e.id === lastEntryId)!;

  for (const entry of entries) {
    if (entry.id === lastEntry.id) break;
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

  return sessionId;
}

describe('final rest "Next" survives a hung background-notification cleanup', () => {
  it('navigates to Summary even when cancelRestNotification never resolves', async () => {
    let db!: Db;
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const sessionId = await sessionAtVeryLastSet(db, 'rest-next-hang-seed');

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
    await waitFor(() => expect(screen.getByTestId('rest-circle')).toBeTruthy(), WAIT_OPTS);

    await fireEvent.press(screen.getByTestId('rest-next'));

    await waitFor(
      () => expect(navigation.replace).toHaveBeenCalledWith('Summary', { sessionId }),
      WAIT_OPTS,
    );
  }, 20000);
});

describe('final rest "Next" from a Summary round trip', () => {
  it('still reaches Summary when the screen was opened with reviewFromSummary', async () => {
    let db!: Db;
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const sessionId = await sessionAtVeryLastSet(db, 'rest-next-review-seed');

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

    await waitFor(() => expect(screen.getByTestId('complete-set')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('complete-set'));
    await waitFor(() => expect(screen.getByTestId('rest-circle')).toBeTruthy(), WAIT_OPTS);

    await fireEvent.press(screen.getByTestId('rest-next'));

    await waitFor(
      () => expect(navigation.replace).toHaveBeenCalledWith('Summary', { sessionId }),
      WAIT_OPTS,
    );
  }, 20000);
});
