/**
 * Reported from the device: jump back (via the Summary/Progress bookmark) to a set that sits
 * behind the front edge — most noticeably one that was previously skipped — and Complete looked
 * like it did nothing.
 *
 * It wasn't a no-op: the log write always landed. What broke was what happened next —
 * `commitSetAndRest` unconditionally routed through the rest page using `entry`/`exercise`
 * recomputed *after* `reload()`, which is the real front edge, not the set that was just fixed.
 * For a bookmark far from the front edge that meant a rest screen previewing a completely
 * unrelated exercise, with no way to tell the correction had taken. The fix: a set completed
 * while behind the front edge skips rest/stage-feedback entirely and returns to Summary, where
 * the correction is visible.
 */
import React from 'react';
import { eq } from 'drizzle-orm';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, schema, sessionsRepo } from '@roamfit/store';
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

it('completing a previously-skipped set reached via a Summary bookmark writes it as completed and returns to Summary, not a rest page for the real front edge', async () => {
  const db = await freshDb();
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString('retro-complete-seed')),
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
  const session0 = sessionsRepo.getSession(db, sessionId)!;
  const mains = session0.entries.filter(
    (e) => e.section === 'main' && e.entryStatus !== 'removed_at_approval',
  );
  const first = mains[0]!;
  db.update(schema.sessionEntries)
    .set({ sets: 2 })
    .where(eq(schema.sessionEntries.id, first.id))
    .run();
  sessionsRepo.startSession(db, sessionId, utcInstant);

  // Set 0 skipped, set 1 done — this entry is now behind the front edge, which has moved on.
  sessionsRepo.logSet(
    db,
    { entryId: first.id, setIndex: 0, status: 'skipped', restPrescribedSec: 45 },
    utcInstant,
  );
  sessionsRepo.logSet(
    db,
    { entryId: first.id, setIndex: 1, status: 'completed', repsActual: 10, restPrescribedSec: 45 },
    utcInstant,
  );

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

  await waitFor(() => expect(screen.getByTestId('complete-set')).toBeTruthy(), WAIT_OPTS);
  fireEvent.press(screen.getByTestId('complete-set'));

  // The retroactive fix landed in the log.
  await waitFor(() => {
    const s = sessionsRepo.getSession(db, sessionId)!;
    const log0 = s.entries.find((e) => e.id === first.id)!.setLogs.find((l) => l.setIndex === 0);
    expect(log0?.status).toBe('completed');
  }, WAIT_OPTS);

  // No rest page for an unrelated front-edge exercise — straight back to Summary instead.
  await waitFor(
    () => expect(navigation.replace).toHaveBeenCalledWith('Summary', { sessionId }),
    WAIT_OPTS,
  );
}, 20000);
