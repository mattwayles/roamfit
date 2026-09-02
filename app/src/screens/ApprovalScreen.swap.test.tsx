/**
 * §10.3 swap at approval, driven through the real screen and the real store.
 *
 * This file used to test an approval-side "too easy ▲" level-up control (ADR 0012). Device
 * feedback replaced that button with Swap — see ADR 0012's amendment. The level-up path itself is
 * unchanged and still covered mid-workout by `WorkoutScreen.levelUp.test.tsx`; what is pinned
 * here is the cold-start level (still ADR 0012's, and still load-bearing) and the swap that took
 * the button's place.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, progressionStateRepo, sessionsRepo } from '@roamfit/store';
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
    request: { focus: 'full', effort: 'normal', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString('approval-level-up-seed')),
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

describe('§10.3 swap at approval', () => {
  it('still starts every family at level 1 (ADR 0012)', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);
    await createPendingSession(db);

    const states = progressionStateRepo.getAllProgressionStates(db);
    for (const family of familyLibrary.families) {
      expect(states[family.id].levelId).toBe(family.levels[0].level_id);
    }
  });

  it('swapping replaces the exercise in the plan without regenerating', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);
    const sessionId = await createPendingSession(db);
    const entry = sessionsRepo
      .getSession(db, sessionId)!
      .entries.find((e) => e.section === 'main')!;

    render(
      <StoreProvider>
        <NavigationContainer>
          <ApprovalScreen
            navigation={mockNavigation() as never}
            route={{ key: 'k', name: 'Approval', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(
      () => expect(screen.getByTestId(`swap-${entry.exerciseId}`)).toBeTruthy(),
      WAIT_OPTS,
    );
    fireEvent.press(screen.getByTestId(`swap-${entry.exerciseId}`));

    // The sheet is the same component §10.6 uses mid-workout, fed by the same engine selection.
    await waitFor(() => expect(screen.getByTestId('swap-sheet')).toBeTruthy(), WAIT_OPTS);
    const option = screen.getAllByTestId(/^swap-option-/)[0];
    const chosenId = (option.props.testID as string).replace('swap-option-', '');
    fireEvent.press(option);

    await waitFor(() => {
      const after = sessionsRepo.getSession(db, sessionId)!.entries.find((e) => e.id === entry.id)!;
      expect(after.exerciseId).toBe(chosenId);
      // §10.10 — the plan still records what the engine originally chose.
      expect(after.plannedExerciseId).toBe(entry.exerciseId);
    }, WAIT_OPTS);

    // The session itself was not regenerated.
    expect(sessionsRepo.getSession(db, sessionId)!.id).toBe(sessionId);
  });

  it('no longer offers a level-up button here', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);
    const sessionId = await createPendingSession(db);
    const entry = sessionsRepo
      .getSession(db, sessionId)!
      .entries.find((e) => e.progressionFamilyId)!;

    render(
      <StoreProvider>
        <NavigationContainer>
          <ApprovalScreen
            navigation={mockNavigation() as never}
            route={{ key: 'k', name: 'Approval', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('start-button')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId(`level-up-${entry.exerciseId}`)).toBeNull();
  });
});
