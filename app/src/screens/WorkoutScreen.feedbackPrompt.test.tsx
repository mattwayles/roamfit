/**
 * The "how did that set feel?" prompt as a modal over the rest page (setting
 * `feedbackPromptEnabled`), versus the inline control it falls back to when switched off.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo, usersRepo } from '@roamfit/store';
import WorkoutScreen from './WorkoutScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

// See the file header — real headroom over RestPhase/TimedExercise's 250ms display-refresh tick
// under CPU contention, not the default 1000ms budget sized for an idle CPU.
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

/** Logs every set of every active entry up to (not including) `stopBeforeEntryId` as completed,
 *  directly via the store — advancing past exercises this test doesn't care about without
 *  driving the UI through them. */
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

describe('"How did that set feel?" modal over the rest screen, driven through WorkoutScreen', () => {
  async function restAfterFirstRepsSet(modal: boolean) {
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
      request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
      clock,
      rng: createRng(seedFromString('feedback-prompt-seed')),
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
    usersRepo.updateUser(db, { feedbackPromptEnabled: modal }, nowUtcInstant());

    const session = sessionsRepo.getSession(db, sessionId)!;
    const firstRepsEntry = session.entries.find(
      (e) =>
        e.entryStatus !== 'removed_at_approval' && e.section === 'main' && e.durationSec == null,
    )!;
    fastForwardTo(db, session, firstRepsEntry.id);

    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={mockNavigation() as never}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('complete-set')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('complete-set'));
    await waitFor(() => expect(screen.getByTestId('rest-circle')).toBeTruthy(), WAIT_OPTS);

    const setLog0 = () =>
      sessionsRepo
        .getSession(db, sessionId)!
        .entries.find((e) => e.id === firstRepsEntry.id)!
        .setLogs.find((l) => l.setIndex === 0)!;
    return { setLog0 };
  }

  it('opens over the running rest timer; an answer records it and closes the modal', async () => {
    const { setLog0 } = await restAfterFirstRepsSet(true);
    expect(screen.getByTestId('feedback-prompt')).toBeTruthy();
    expect(screen.getByTestId('rest-remaining')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('difficulty-too_hard'));
    await waitFor(() => expect(setLog0().difficultyFeedback).toBe('too_hard'), WAIT_OPTS);
    await waitFor(() => expect(screen.queryByTestId('feedback-prompt')).toBeNull(), WAIT_OPTS);
    // The question is not asked a second time inline.
    expect(screen.queryByTestId('difficulty-segment')).toBeNull();
  });

  it('Skip closes it and records nothing', async () => {
    const { setLog0 } = await restAfterFirstRepsSet(true);
    await fireEvent.press(screen.getByTestId('feedback-prompt-skip'));
    await waitFor(() => expect(screen.queryByTestId('feedback-prompt')).toBeNull(), WAIT_OPTS);
    expect(setLog0().difficultyFeedback).toBeNull();
  });

  it('with the setting off there is no modal and the question stays inline', async () => {
    await restAfterFirstRepsSet(false);
    expect(screen.queryByTestId('feedback-prompt')).toBeNull();
    expect(screen.getByTestId('difficulty-segment')).toBeTruthy();
  });
});
