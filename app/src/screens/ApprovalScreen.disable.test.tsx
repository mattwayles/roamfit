/**
 * §10.3 disable-and-swap at approval (track 14). Disabling an exercise from this screen is
 * permanent (`exercise_state.disabled_at`, the same column the Exercises detail screen writes)
 * and immediate: the reviewer should never keep looking at an exercise they just vetoed, so the
 * screen re-runs the same swap path `handleSwap` uses right after the write.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { exerciseStateRepo, generate, sessionsRepo } from '@roamfit/store';
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
    rng: createRng(seedFromString('approval-disable-seed')),
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

describe('§10.3 disable at approval', () => {
  it('disables the exercise permanently and swaps it out of the current session', async () => {
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
      () => expect(screen.getByTestId(`disable-${entry.exerciseId}`)).toBeTruthy(),
      WAIT_OPTS,
    );
    fireEvent.press(screen.getByTestId(`disable-${entry.exerciseId}`));

    await waitFor(() => {
      expect(exerciseStateRepo.getExerciseState(db, entry.exerciseId)?.disabledAt).not.toBeNull();
    }, WAIT_OPTS);

    // Either swapped for something else, or removed if nothing else fit the slot — either way
    // the disabled exercise itself is no longer active in this session.
    await waitFor(() => {
      const after = sessionsRepo
        .getSession(db, sessionId)!
        .entries.filter((e) => e.entryStatus !== 'removed_at_approval');
      expect(after.some((e) => e.id === entry.id && e.exerciseId === entry.exerciseId)).toBe(false);
    }, WAIT_OPTS);
    expect(screen.getByTestId('swap-notice')).toHaveTextContent(/^Disabled\./);
  });
});
