/**
 * §10.6 — a swap rewrites the same plan entry in place (same entry id, same set index), so the
 * set hero has to remount on the exercise changing, not only on the slot. It used to be keyed on
 * entry+set alone: swapping a bodyweight exercise for a banded one showed the new name and
 * "target" line (read straight off the entry) but kept the old exercise's band (none, so no band
 * picker at all) and its rep counter (whatever the user had already dialled in).
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { AnchorClass, Pattern, ProgressionFamilyId } from '@roamfit/data';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import {
  alternativesForSlot,
  buildSwapReplacementEntry,
  createRng,
  seedFromString,
  type SessionEntry,
} from '@roamfit/engine';
import { exerciseStateRepo, generate, sessionsRepo, usersRepo } from '@roamfit/store';
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

/** The same engine-shaped entry `WorkoutScreen` hands `alternativesForSlot`. */
function toEngineEntry(entry: sessionsRepo.SessionEntryRecord): SessionEntry {
  return {
    exerciseId: entry.exerciseId,
    role: 'main',
    band: entry.band,
    sets: entry.sets,
    repTarget: entry.repTarget ?? undefined,
    durationSec: entry.durationSec ?? undefined,
    restSec: entry.restSec,
    tempoSec: entry.tempoSec,
    notes: entry.notes ?? undefined,
    difficulty: entry.difficulty,
    progressionFamilyId: entry.progressionFamilyId as ProgressionFamilyId | null,
    progressionLevelIdAtTime: entry.progressionLevelIdAtTime,
    pattern: entry.pattern as Pattern,
    anchorClass: entry.anchorClass as AnchorClass,
    unilateral: entry.unilateral,
    estimatedSec: entry.estimatedSec,
  };
}

describe('§10.6 swap remounts the set hero for the swapped-in exercise', () => {
  it('bodyweight -> banded: the band picker appears and the rep counter resets to the new target', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    await render(
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
      rng: createRng(seedFromString('swap-remount-seed')),
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

    // Put a bodyweight rep exercise in the first slot, chosen so that the screen's own one-tap
    // swap (top-ranked alternative, same inputs as below) lands on a banded rep exercise.
    const session = sessionsRepo.getSession(db, sessionId)!;
    const first = session.entries.find((e) => e.entryStatus !== 'removed_at_approval')!;
    const profile = usersRepo.buildUserProfile(db, clock.today);
    const topAlternative = (engineEntry: SessionEntry) =>
      alternativesForSlot({
        library: exerciseLibrary.exercises,
        entry: engineEntry,
        anchorsAvailable: profile.anchorsAvailable,
        limitations: profile.limitations,
        disabledExerciseIds: profile.disabledExerciseIds,
        today: clock.today,
        history: sessionsRepo.getHistoryForGeneration(db),
        exerciseStates: exerciseStateRepo.getAllExerciseStates(db),
      })[0];
    const base: SessionEntry = { ...toEngineEntry(first), repTarget: 10, durationSec: undefined };
    const bodyweight = exerciseLibrary.exercises.find((ex) => {
      if (ex.equipment === 'band' || ex.metric === 'time' || !ex.roles.includes('main')) {
        return false;
      }
      const seeded = buildSwapReplacementEntry(ex, base);
      const next = topAlternative({ ...seeded, substitutedFor: undefined });
      return next?.replacement.band != null && next.replacement.repTarget != null;
    });
    expect(bodyweight).toBeTruthy();
    sessionsRepo.recordSwapAtApproval(
      db,
      first.id,
      buildSwapReplacementEntry(bodyweight!, base),
      nowUtcInstant(),
    );
    sessionsRepo.startSession(db, sessionId, nowUtcInstant());
    const seededEntry = sessionsRepo
      .getSession(db, sessionId)!
      .entries.find((e) => e.id === first.id)!;
    expect(seededEntry.band).toBeNull();

    await render(
      <StoreProvider>
        <WorkoutScreen
          navigation={mockNavigation() as never}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('rep-count')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByLabelText('Band used for this set')).toBeNull();

    // Dial the counter away from the prescription, the way a user mid-set would.
    await fireEvent.press(screen.getByTestId('rep-plus'));
    await fireEvent.press(screen.getByTestId('rep-plus'));
    await fireEvent.press(screen.getByTestId('rep-plus'));
    expect(screen.getByTestId('rep-count').props.value).toBe(String(seededEntry.repTarget! + 3));

    await fireEvent.press(screen.getByTestId('swap-set'));

    const after = sessionsRepo.getSession(db, sessionId)!.entries.find((e) => e.id === first.id)!;
    expect(after.exerciseId).not.toBe(bodyweight!.id);
    expect(after.band).not.toBeNull();
    const afterName = exerciseLibrary.exercises.find((e) => e.id === after.exerciseId)!.name;

    await waitFor(
      () => expect(screen.getByTestId('exercise-name').props.children).toContain(afterName),
      WAIT_OPTS,
    );
    expect(screen.getByTestId(`band-chip-${after.band}`)).toBeTruthy();
    expect(screen.getByTestId('rep-count').props.value).toBe(String(after.repTarget));
  });
});
