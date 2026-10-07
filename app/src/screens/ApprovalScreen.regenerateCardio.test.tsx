/**
 * Regenerate on Approval must keep the Cardio add-on: a strength session that was generated with
 * cardio moves woven in regenerates with cardio moves again.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary, isCardioExercise } from '@roamfit/data';
import { generate, sessionsRepo } from '@roamfit/store';
import ApprovalScreen from './ApprovalScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

function Setup({ onReady }: { onReady: (db: ReturnType<typeof useStore>['db']) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

describe('Regenerate keeps the Cardio add-on', () => {
  it('the regenerated plan still has cardio moves in MAIN', async () => {
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
      request: { focus: 'full', difficulty: 'medium', targetMinutes: 45, cardioAddOn: true },
      clock,
      rng: createRng(seedFromString('regen-cardio-seed')),
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
    const navigation = {
      navigate: jest.fn(),
      replace: jest.fn(),
      reset: jest.fn(),
      goBack: jest.fn(),
    };
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
    await waitFor(() => expect(screen.getByTestId('regenerate-button')).toBeTruthy(), WAIT_OPTS);
    await fireEvent.press(screen.getByTestId('regenerate-button'));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled(), WAIT_OPTS);

    const newId = navigation.replace.mock.calls[0][1].sessionId as string;
    const fresh = sessionsRepo.getPendingSession(db);
    expect(fresh?.id).toBe(newId);
    const cardio = fresh!.entries.filter(
      (e) =>
        e.section === 'main' &&
        exerciseLibrary.exercises.some((x) => x.id === e.exerciseId && isCardioExercise(x)),
    );
    expect(cardio.length).toBeGreaterThan(0);
  });
});
