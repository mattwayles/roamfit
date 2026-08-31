/**
 * §10.8 crash safety, at the app layer: "state persists per set, so a force-quit resumes exactly
 * where it left off." `packages/store`'s `lifecycle.test.ts` already proves the underlying data
 * survives a real close+reopen (file-backed harness, issue #10); this test proves the other half
 * — that `WorkoutScreen`'s `findCurrent()` resume logic, given only what's already committed in
 * `set_logs`, renders the correct next set on a **fresh mount** (standing in for a fresh app
 * launch after a force-quit — nothing about this test relies on any React state surviving, only
 * on what's in the db).
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo } from '@roamfit/store';
import WorkoutScreen from './WorkoutScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

// Generous timeout/poll, per issue #14: default waitFor budgets are sized for an idle
// CPU and can be starved under real contention even when the underlying state is
// already correct.
const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

function mockNavigation() {
  return { navigate: jest.fn(), replace: jest.fn(), reset: jest.fn(), goBack: jest.fn() } as never;
}

/** Mirrors WorkoutScreen's own `findCurrent` — independently, as test assertion logic, not
 *  shared production code — so the assertion is "the UI matches what a fresh read of the
 *  session says," not "the UI matches whatever WorkoutScreen's internals happen to compute." */
function expectedCurrent(session: sessionsRepo.SessionRecord) {
  for (const entry of session.entries) {
    if (entry.entryStatus === 'removed_at_approval') continue;
    if (entry.setLogs.length < entry.sets) return { entry, setIndex: entry.setLogs.length };
  }
  return null;
}

function SetupAndCleanup({
  onReady,
}: {
  onReady: (db: ReturnType<typeof useStore>['db']) => void;
}): React.JSX.Element {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return <></>;
}

describe('WorkoutScreen crash-safety resume', () => {
  it('a fresh mount resumes at the exact set after one set was logged "before the force-quit"', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <SetupAndCleanup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const library = exerciseLibrary;
    const families = familyLibrary;

    const clock = nowEngineClock();
    const utcInstant = nowUtcInstant();
    const { plan, comebackTier, recoveryWeekManual } = generate(db, {
      library,
      families,
      request: { focus: 'upper', effort: 'normal', targetMinutes: 20 },
      clock,
      rng: createRng(seedFromString('workout-resume-test-seed')),
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

    // "Before the force-quit": the user completed set 0 of the first main entry. This is a
    // direct, already-verified store call (mirrors packages/store's own tests) — not something
    // this test is trying to prove; it's the precondition.
    const session = sessionsRepo.getSession(db, sessionId)!;
    const firstMain = session.entries.find((e) => e.section === 'main')!;
    sessionsRepo.logSet(
      db,
      {
        entryId: firstMain.id,
        setIndex: 0,
        status: 'completed',
        repsPrescribed: firstMain.repTarget ?? undefined,
        secondsPrescribed: firstMain.durationSec ?? undefined,
        repsActual: firstMain.repTarget ?? undefined,
        secondsActual: firstMain.durationSec ?? undefined,
        restPrescribedSec: firstMain.restSec,
      },
      nowUtcInstant(),
    );

    // "Force-quit, then relaunch": a completely fresh render of WorkoutScreen for this
    // sessionId, with no React state carried over from anything above (this test process never
    // rendered WorkoutScreen before this point).
    const resumedSession = sessionsRepo.getSession(db, sessionId)!;
    const expected = expectedCurrent(resumedSession)!;
    const expectedExercise = library.exercises.find((e) => e.id === expected.entry.exerciseId)!;

    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={mockNavigation()}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByText(expectedExercise.name)).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByText(`Set ${expected.setIndex + 1} of ${expected.entry.sets}`)).toBeTruthy();

    // The specific regression this guards against: resuming at set 1 (index 0) of the exercise
    // whose set 0 was already logged would mean the completed set was silently lost.
    if (expected.entry.id === firstMain.id) {
      expect(expected.setIndex).toBeGreaterThan(0);
    }
  });
});
