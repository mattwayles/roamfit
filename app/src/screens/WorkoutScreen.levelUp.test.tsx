/**
 * ADR 0012 — "Too easy ▲" mid-workout, driven through the real WorkoutScreen against the real
 * store. Confirms it advances the family's ladder and rewrites the entry in place, without the
 * swap-away penalty a Swap carries: the user has not rejected the exercise, they have outgrown it.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import type { ProgressionFamilyId } from '@roamfit/data';
import { generate, progressionStateRepo, sessionsRepo } from '@roamfit/store';
import WorkoutScreen from './WorkoutScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

// Generous timeout/poll, per issue #14: default waitFor budgets are sized for an idle
// CPU and can be starved under real contention even when the underlying state is
// already correct.
const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

function mockNavigation() {
  return {
    navigate: jest.fn(),
    replace: jest.fn(),
    reset: jest.fn(),
    goBack: jest.fn(),
  };
}

function Setup({ onReady }: { onReady: (db: ReturnType<typeof useStore>['db']) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

function fastForwardTo(
  db: ReturnType<typeof useStore>['db'],
  session: sessionsRepo.SessionRecord,
  stopBeforeEntryId: string,
) {
  for (const entry of session.entries) {
    if (entry.id === stopBeforeEntryId) return;
    if (entry.entryStatus === 'removed_at_approval') continue;
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
}

describe('ADR 0012 — level up mid-workout', () => {
  it('Too easy advances the ladder and replaces the exercise in place', async () => {
    let db!: ReturnType<typeof useStore>['db'];
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
      rng: createRng(seedFromString('workout-level-up-seed')),
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
    const active = session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
    // A reps-based laddered entry, so the RepsExercise view (not the timed one) renders.
    const target = active.find((e) => e.durationSec == null && e.progressionFamilyId)!;
    expect(target).toBeTruthy();
    const familyId = target.progressionFamilyId as ProgressionFamilyId;
    const family = familyLibrary.families.find((f) => f.id === familyId)!;
    expect(progressionStateRepo.getAllProgressionStates(db)[familyId].levelId).toBe(
      family.levels[0].level_id,
    );

    fastForwardTo(db, session, target.id);
    const originalExerciseId = target.exerciseId;

    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={mockNavigation() as never}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('level-up-set')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('level-up-set'));

    await waitFor(() => {
      expect(progressionStateRepo.getAllProgressionStates(db)[familyId].levelId).toBe(
        family.levels[1].level_id,
      );
    }, WAIT_OPTS);

    const after = sessionsRepo.getSession(db, sessionId)!.entries.find((e) => e.id === target.id)!;
    expect(after.exerciseId).not.toBe(originalExerciseId);
    expect(family.levels[1].exercise_ids).toContain(after.exerciseId);
    expect(screen.getByTestId('level-up-notice')).toBeTruthy();
  });
});
