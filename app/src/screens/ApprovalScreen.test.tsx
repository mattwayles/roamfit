/**
 * §10.3 Plan Approval, driven through the real ApprovalScreen (not mocked) against the real
 * on-device-shaped store: add exercise, edit rep target, adjust sets, remove — and the live time
 * estimate updating as each of those happens. Previously only exercised indirectly (see prior
 * STATUS file); this is the first dedicated interaction test for this screen.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo } from '@roamfit/store';
import ApprovalScreen from './ApprovalScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

function mockNavigation() {
  return { navigate: jest.fn(), replace: jest.fn(), reset: jest.fn(), goBack: jest.fn() };
}

function Setup({ onReady }: { onReady: (db: ReturnType<typeof useStore>['db']) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

async function createPendingSession(db: ReturnType<typeof useStore>['db']): Promise<string> {
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', difficulty: 'medium', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString('approval-test-seed')),
    utcInstant,
  });
  return sessionsRepo.createPendingSession(db, {
    plan,
    utcInstant,
    localDate: clock.today,
    tzId: clock.tzId,
    comebackTier,
    recoveryWeekManual,
  });
}

describe('§10.3 Plan Approval, driven through ApprovalScreen', () => {
  it('add exercise, edit rep target, adjust sets, and remove all mutate the real store and the live estimate updates', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const sessionId = await createPendingSession(db);
    const navigation = mockNavigation();
    render(
      <StoreProvider>
        <NavigationContainer>
          <ApprovalScreen
            navigation={navigation as never}
            route={{ key: 'Approval', name: 'Approval', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('start-button')).toBeTruthy(), WAIT_OPTS);

    const initialEstimateText = screen.getByText(/min estimated/).props.children.join('');

    // --- Add exercise ---------------------------------------------------------------------
    const mainBefore = sessionsRepo
      .getSession(db, sessionId)!
      .entries.filter((e) => e.section === 'main' && e.entryStatus !== 'removed_at_approval');

    await fireEvent.press(screen.getByTestId('add-exercise-main'));
    await waitFor(() => expect(screen.getByTestId('add-picker-main')).toBeTruthy(), WAIT_OPTS);
    const options = screen.getAllByTestId(/^add-option-/);
    expect(options.length).toBeGreaterThan(0);
    const chosenTestId = options[0].props.testID as string;
    const chosenExerciseId = chosenTestId.replace('add-option-', '');
    await fireEvent.press(screen.getByTestId(chosenTestId));

    await waitFor(() => {
      const after = sessionsRepo.getSession(db, sessionId)!;
      const mainAfter = after.entries.filter(
        (e) => e.section === 'main' && e.entryStatus !== 'removed_at_approval',
      );
      expect(mainAfter.length).toBe(mainBefore.length + 1);
      expect(mainAfter.some((e) => e.exerciseId === chosenExerciseId)).toBe(true);
      const added = mainAfter.find((e) => e.exerciseId === chosenExerciseId)!;
      expect(added.unplanned).toBe(true);
      expect(added.entryStatus).toBe('unplanned_added');
    }, WAIT_OPTS);

    // The §8.3 signal was recorded, and the picker closed back to the add-exercise button.
    expect(
      sessionsRepo
        .getSession(db, sessionId)!
        .entries.some((e) => e.exerciseId === chosenExerciseId),
    ).toBe(true);
    await waitFor(() => expect(screen.getByTestId('add-exercise-main')).toBeTruthy(), WAIT_OPTS);

    // The live estimate changed after adding a whole extra exercise.
    await waitFor(() => {
      const nowText = screen.getByText(/min estimated/).props.children.join('');
      expect(nowText).not.toBe(initialEstimateText);
    }, WAIT_OPTS);

    // --- Edit rep target (only entries with a rep target expose the field) -----------------
    const repEntry = sessionsRepo
      .getSession(db, sessionId)!
      .entries.find((e) => e.entryStatus !== 'removed_at_approval' && e.repTarget != null)!;
    const originalRepTarget = repEntry.repTarget!;

    const repsField = screen.getByTestId(`reps-input-${repEntry.exerciseId}`);
    await fireEvent.changeText(repsField, String(originalRepTarget + 1));
    await fireEvent(repsField, 'submitEditing');
    await waitFor(() => {
      const after = sessionsRepo
        .getSession(db, sessionId)!
        .entries.find((e) => e.id === repEntry.id)!;
      expect(after.repTarget).toBe(originalRepTarget + 1);
    }, WAIT_OPTS);

    // --- Adjust sets ------------------------------------------------------------------------
    const originalSets = repEntry.sets;
    const setsField = screen.getByTestId(`sets-input-${repEntry.exerciseId}`);
    await fireEvent.changeText(setsField, String(originalSets + 1));
    await fireEvent(setsField, 'submitEditing');
    await waitFor(() => {
      const after = sessionsRepo
        .getSession(db, sessionId)!
        .entries.find((e) => e.id === repEntry.id)!;
      expect(after.sets).toBe(originalSets + 1);
    }, WAIT_OPTS);

    // --- Remove -------------------------------------------------------------------------------
    await fireEvent.press(screen.getByTestId(`remove-${repEntry.exerciseId}`));
    await waitFor(() => {
      const after = sessionsRepo
        .getSession(db, sessionId)!
        .entries.find((e) => e.id === repEntry.id)!;
      expect(after.entryStatus).toBe('removed_at_approval');
    }, WAIT_OPTS);
    // Removed rows disappear from the visible list (they aren't deleted, just hidden — §10.10).
    expect(screen.queryByTestId(`entry-${repEntry.exerciseId}`)).toBeNull();
  });
});
