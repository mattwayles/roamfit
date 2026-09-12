/**
 * Selecting a set from Summary is a user override of "you are here", not a crash-safety resume —
 * it has to survive leaving `WorkoutScreen`, so arriving via a Summary bookmark (`jumpTo`)
 * persists the selection onto the session row (`setSessionCursor`), and landing back on the
 * workout's own front edge drops it again. See `sessionCursor.test.ts` for the store-level round
 * trip and `SummaryScreen.test.tsx` for the marker itself following the override.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo } from '@roamfit/store';
import type { Db } from '@roamfit/store';
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

function Setup({ onReady }: { onReady: (db: Db) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

async function freshDb(): Promise<Db> {
  let db!: Db;
  render(
    <StoreProvider>
      <Setup onReady={(d) => (db = d)} />
    </StoreProvider>,
  );
  await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);
  return db;
}

it('arriving via a Summary bookmark persists the selection as the session cursor', async () => {
  const db = await freshDb();
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString('cursor-persist-seed')),
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
  const second = active[1]!;

  const navigation = mockNavigation();
  render(
    <StoreProvider>
      <WorkoutScreen
        navigation={navigation as never}
        route={
          {
            key: 'Workout',
            name: 'Workout',
            // Nothing is logged, so the derived front edge is `active[0]` set 0 — this bookmark
            // is an entirely unrelated, later entry, the "regardless of completion" case.
            params: { sessionId, jumpTo: { entryId: second.id, setIndex: 0 } },
          } as never
        }
      />
    </StoreProvider>,
  );

  await waitFor(() => {
    const s = sessionsRepo.getSession(db, sessionId)!;
    expect(s.cursorEntryId).toBe(second.id);
    expect(s.cursorSetIndex).toBe(0);
  }, WAIT_OPTS);
});

it('training the front-edge set through to completion drops the cursor back to null', async () => {
  const db = await freshDb();
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString('cursor-clear-seed')),
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

  await waitFor(() => expect(screen.getByTestId('complete-set')).toBeTruthy(), WAIT_OPTS);
  fireEvent.press(screen.getByTestId('complete-set'));

  await waitFor(() => {
    const s = sessionsRepo.getSession(db, sessionId)!;
    expect(s.cursorEntryId).toBeNull();
    expect(s.cursorSetIndex).toBeNull();
  }, WAIT_OPTS);
}, 20000);
