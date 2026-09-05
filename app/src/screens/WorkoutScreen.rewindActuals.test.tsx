/**
 * Stepping back onto a set you already logged shows what you *did*, not what you were asked to do.
 *
 * Reported from the device: change the band, reps or hold length on a set, COMPLETE it, then use
 * ◂◂ to come back — and the original prescription was on screen again. The summary read the set
 * logs and so was always right, which is how the disagreement surfaced.
 *
 * Both hero components seed their state from the prescription and are remounted per set (the
 * caller keys on entry+setIndex), so the default they are handed is the whole fix: it has to be
 * the set's own logged value once that set has run. The reverse case matters just as much and is
 * asserted here too — a set that has *not* run yet must still show the prescription, because reps
 * and seconds are performance against an unchanged ask. Only the band carries forward, since a
 * band is equipment you are still holding on the next set.
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
import { fastForwardTo } from './timedTestHelpers';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

function mockNavigation() {
  return { navigate: jest.fn(), replace: jest.fn(), reset: jest.fn(), goBack: jest.fn() };
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

/**
 * A started session whose first active main entry has been forced into a controlled shape — the
 * same trick `timedTestHelpers.setUpTimedEntry` uses, widened to set reps/sets/band too so one
 * helper serves both hero views. Everything before it is logged so the screen lands here.
 */
async function setUpEntry(
  db: Db,
  seed: string,
  shape: {
    sets: number;
    band: 'B1' | 'B2' | 'B3' | 'B4' | 'B5';
    repTarget?: number | null;
    durationSec?: number | null;
    unilateral?: boolean;
  },
): Promise<{ sessionId: string; entryId: string }> {
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

  const session = sessionsRepo.getSession(db, sessionId)!;
  const firstMain = session.entries.find(
    (e) => e.section === 'main' && e.entryStatus !== 'removed_at_approval',
  )!;

  db.update(schema.sessionEntries)
    .set({
      sets: shape.sets,
      band: shape.band,
      repTarget: shape.repTarget ?? null,
      durationSec: shape.durationSec ?? null,
      unilateral: shape.unilateral ?? false,
    })
    .where(eq(schema.sessionEntries.id, firstMain.id))
    .run();

  fastForwardTo(db, session, firstMain.id);
  sessionsRepo.startSession(db, sessionId, nowUtcInstant());
  return { sessionId, entryId: firstMain.id };
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

describe('◂◂ onto an already-logged set restores what was recorded', () => {
  it('reps: the logged count comes back, and the set that has not run still shows the ask', async () => {
    const db = await freshDb();
    const { sessionId, entryId } = await setUpEntry(db, 'rewind-reps-seed', {
      sets: 2,
      band: 'B2',
      repTarget: 12,
    });

    // Set 1 of 2, done at 9 reps on a heavier band than prescribed.
    sessionsRepo.logSet(
      db,
      {
        entryId,
        setIndex: 0,
        status: 'completed',
        repsPrescribed: 12,
        repsActual: 9,
        bandActual: 'B4',
        restPrescribedSec: 45,
      },
      nowUtcInstant(),
    );

    renderWorkout(sessionId);
    await waitFor(() => expect(screen.getByTestId('rep-count')).toBeTruthy(), WAIT_OPTS);

    // The front edge — set 2, which has not run. The prescription is still the ask: managing 9 of
    // 12 does not quietly make 9 the target. The band, being equipment, does carry forward.
    expect(screen.getByTestId('rep-count').props.value).toBe('12');
    expect(screen.getByTestId('band-chip-B4')).toBeTruthy();

    fireEvent.press(screen.getByTestId('rewind-set'));

    // Back on set 1: what was actually done, on the band it was actually done with.
    await waitFor(
      () => expect(screen.getByTestId('rep-count').props.value).toBe('9'),
      WAIT_OPTS,
    );
    expect(screen.getByTestId('band-chip-B4')).toBeTruthy();
  }, 20000);

  it('timed: the logged hold comes back', async () => {
    const db = await freshDb();
    const { sessionId, entryId } = await setUpEntry(db, 'rewind-timed-seed', {
      sets: 2,
      band: 'B2',
      durationSec: 30,
    });

    sessionsRepo.logSet(
      db,
      {
        entryId,
        setIndex: 0,
        status: 'completed',
        secondsPrescribed: 30,
        secondsActual: 45,
        bandActual: 'B2',
        restPrescribedSec: 45,
      },
      nowUtcInstant(),
    );

    renderWorkout(sessionId);
    await waitFor(() => expect(screen.getByTestId('timed-remaining')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('timed-remaining')).toHaveTextContent('30');

    fireEvent.press(screen.getByTestId('rewind-set'));
    await waitFor(
      () => expect(screen.getByTestId('timed-remaining')).toHaveTextContent('45'),
      WAIT_OPTS,
    );
  }, 20000);

  it('timed unilateral: the logged hold is per side, not the both-sides total', async () => {
    const db = await freshDb();
    const { sessionId, entryId } = await setUpEntry(db, 'rewind-timed-uni-seed', {
      sets: 2,
      band: 'B2',
      durationSec: 30,
      unilateral: true,
    });

    // §10.5 records `secondsActual` for the whole set — both sides summed. The timer works in
    // per-side seconds, so restoring the raw total here would double a unilateral hold.
    sessionsRepo.logSet(
      db,
      {
        entryId,
        setIndex: 0,
        status: 'completed',
        secondsPrescribed: 60,
        secondsActual: 90,
        bandActual: 'B2',
        restPrescribedSec: 45,
      },
      nowUtcInstant(),
    );

    renderWorkout(sessionId);
    await waitFor(() => expect(screen.getByTestId('timed-remaining')).toBeTruthy(), WAIT_OPTS);

    fireEvent.press(screen.getByTestId('rewind-set'));
    await waitFor(
      () => expect(screen.getByTestId('timed-remaining')).toHaveTextContent('45'),
      WAIT_OPTS,
    );
  }, 20000);
});
