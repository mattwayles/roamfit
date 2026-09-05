/**
 * The anchor requirement, on the set itself. `AnchorBadge.test.tsx` covers which anchors get a
 * label; this covers the wiring that gets one onto the live workout page at all — that the screen
 * reads the *library* record's `anchor` (the session entry only carries `anchorClass`, the §13.1
 * safety bucket, which cannot tell a low point from a high one).
 */
import React from 'react';
import { eq } from 'drizzle-orm';
import { render, screen, waitFor } from '@testing-library/react-native';
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

/**
 * A started session whose first slot is `exerciseId`, as reps. Forcing the exercise is the point:
 * which anchors the generator happens to pick is not this test's business, and pinning one makes
 * the assertion about the screen rather than about today's plan.
 */
async function sessionStartingWith(db: Db, seed: string, exerciseId: string) {
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
  sessionsRepo.startSession(db, sessionId, nowUtcInstant());

  const session = sessionsRepo.getSession(db, sessionId)!;
  const first = session.entries.find((e) => e.entryStatus !== 'removed_at_approval')!;
  db.update(schema.sessionEntries)
    .set({ exerciseId, durationSec: null, repTarget: 10, unilateral: false, sets: 2 })
    .where(eq(schema.sessionEntries.id, first.id))
    .run();
  return sessionId;
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

describe('the anchor a set needs, shown on the set', () => {
  it('names the fixed point on the exercise page', async () => {
    let db!: Db;
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    // `lat-pulldown` is `anchor-high` in the library — a band that has to go over something.
    const sessionId = await sessionStartingWith(db, 'anchor-high-seed', 'lat-pulldown');
    renderWorkout(sessionId);

    await waitFor(() => expect(screen.getByTestId('exercise-name')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('anchor-badge')).toBeTruthy();
    expect(screen.getByText('High anchor')).toBeTruthy();
  }, 20000);

  it('names both anchor options for an exercise with anchor_alt', async () => {
    let db!: Db;
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    // `face-pull` is anchor-high, anchor_alt anchor-mid — either fixed point works.
    const sessionId = await sessionStartingWith(db, 'anchor-alt-seed', 'face-pull');
    renderWorkout(sessionId);

    await waitFor(() => expect(screen.getByTestId('exercise-name')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByText('High anchor or middle anchor')).toBeTruthy();
  }, 20000);

  it('says nothing on a self-anchored exercise, so the badge stays worth reading', async () => {
    let db!: Db;
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    // `stance` — you stand on the band; there is nothing to go and find.
    const stanceExercise = exerciseLibrary.exercises.find((e) => e.anchor === 'stance')!;
    const sessionId = await sessionStartingWith(db, 'anchor-none-seed', stanceExercise.id);
    renderWorkout(sessionId);

    await waitFor(() => expect(screen.getByTestId('exercise-name')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId('anchor-badge')).toBeNull();
  }, 20000);
});
