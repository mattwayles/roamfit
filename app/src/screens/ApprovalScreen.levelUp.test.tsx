/**
 * ADR 0012 — the "too easy ▲" control on the approval screen, driven through the real screen and
 * the real store. Cold start is level 1, so the first laddered entry is always a bottom rung and
 * this is the control that gets an already-trained user out of it.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import type { ProgressionFamilyId } from '@roamfit/data';
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

describe('ADR 0012 — level up from the approval screen', () => {
  it('starts every family at level 1, then a tap moves the entry to the next rung', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);

    const sessionId = await createPendingSession(db);

    // Cold start is the bottom of every ladder (ADR 0012).
    const states = progressionStateRepo.getAllProgressionStates(db);
    for (const family of familyLibrary.families) {
      expect(states[family.id].levelId).toBe(family.levels[0].level_id);
    }

    const entry = sessionsRepo.getSession(db, sessionId)!.entries.find(
      (e) => e.progressionFamilyId,
    )!;
    const familyId = entry.progressionFamilyId as ProgressionFamilyId;
    const family = familyLibrary.families.find((f) => f.id === familyId)!;

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
      () => expect(screen.getByTestId(`level-up-${entry.exerciseId}`)).toBeTruthy(),
      WAIT_OPTS,
    );
    fireEvent.press(screen.getByTestId(`level-up-${entry.exerciseId}`));

    await waitFor(() => {
      expect(progressionStateRepo.getAllProgressionStates(db)[familyId].levelId).toBe(
        family.levels[1].level_id,
      );
    }, WAIT_OPTS);

    const after = sessionsRepo.getSession(db, sessionId)!.entries.find((e) => e.id === entry.id)!;
    expect(after.exerciseId).not.toBe(entry.exerciseId);
    expect(family.levels[1].exercise_ids).toContain(after.exerciseId);
    expect(screen.getByTestId('level-up-notice')).toBeTruthy();
  });

  it('offers no level-up control on a non-laddered accessory entry', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);
    const sessionId = await createPendingSession(db);
    const accessory = sessionsRepo.getSession(db, sessionId)!.entries.find(
      (e) => !e.progressionFamilyId,
    )!;

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
    expect(screen.queryByTestId(`level-up-${accessory.exerciseId}`)).toBeNull();
  });
});
