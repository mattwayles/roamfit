/**
 * User-reported: adding a note on the rest screen saved it against the *next* exercise instead of
 * the one just finished. `entry`/`exercise` deliberately flip to the upcoming set as soon as a set
 * completes (so the rest screen's next-exercise preview — anchor, band, demo, how-to — is right),
 * but the pinned note is the user's own note about what they just did, not a preview of what's
 * coming — it needs the opposite entry. See `restingEntryId`/`noteExerciseId` in WorkoutScreen.tsx.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { exerciseStateRepo, generate, sessionsRepo } from '@roamfit/store';
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

function activeEntries(session: sessionsRepo.SessionRecord) {
  return session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
}

describe('Rest screen pinned note applies to the exercise just finished, not the one up next', () => {
  it('a note typed on the rest page after finishing exercise A saves under A, not the next-up exercise B', async () => {
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
      request: { focus: 'full', difficulty: 'medium', targetMinutes: 45 },
      clock,
      rng: createRng(seedFromString('rest-note-test-seed')),
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
    const entries = activeEntries(session);

    // Two consecutive entries with different exercises — any full-body session has several. `A`
    // must be reps-based (a single `complete-set` press finishes it outright, no countdown to
    // run out) and must NOT be the last entry of the whole plan — otherwise resting after it is
    // the *final*-rest special case, where `entry` already (correctly) falls back to the
    // just-finished exercise regardless of this bug, and the test would pass for the wrong reason.
    let entryAIndex = -1;
    for (let i = 0; i < entries.length - 1; i++) {
      if (entries[i].exerciseId !== entries[i + 1].exerciseId && entries[i].durationSec == null) {
        entryAIndex = i;
        break;
      }
    }
    expect(entryAIndex).toBeGreaterThanOrEqual(0);
    const entryA = entries[entryAIndex];
    const entryB = entries[entryAIndex + 1];
    expect(entryA.exerciseId).not.toBe(entryB.exerciseId);

    // Log everything before A, then all of A's sets except the last one, directly via the store —
    // this test is about the rest page after A's *last* set, not the UI path to get there.
    for (const entry of entries) {
      if (entry.id === entryA.id) break;
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
    for (let i = 0; i < entryA.sets - 1; i++) {
      sessionsRepo.logSet(
        db,
        {
          entryId: entryA.id,
          setIndex: i,
          status: 'completed',
          repsPrescribed: entryA.repTarget ?? undefined,
          secondsPrescribed: entryA.durationSec ?? undefined,
          repsActual: entryA.repTarget ?? undefined,
          secondsActual: entryA.durationSec ?? undefined,
          restPrescribedSec: entryA.restSec,
        },
        nowUtcInstant(),
      );
    }

    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={mockNavigation() as never}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );

    // Lands on A's last set — reps-based, so `complete-set` finishes it in one press.
    await waitFor(() => expect(screen.getByTestId('complete-set')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('complete-set'));

    // Now on the rest page after A — `entry`/`exercise` internally already point at B (the
    // next-up preview), which is exactly the state that reproduced the bug.
    await waitFor(() => expect(screen.getByTestId('rest-circle')).toBeTruthy(), WAIT_OPTS);
    await waitFor(() => expect(screen.getByTestId('pinned-note-input')).toBeTruthy(), WAIT_OPTS);
    const noteInput = screen.getByTestId('pinned-note-input');
    await fireEvent.changeText(noteInput, 'go slower on the negative');
    await fireEvent(noteInput, 'blur');

    await waitFor(() => {
      const stateA = exerciseStateRepo.getExerciseState(db, entryA.exerciseId);
      expect(stateA?.pinnedNote).toBe('go slower on the negative');
    }, WAIT_OPTS);

    const stateB = exerciseStateRepo.getExerciseState(db, entryB.exerciseId);
    expect(stateB?.pinnedNote ?? null).toBeNull();
  }, 20000);
});
