/**
 * Adding an exercise at approval prescribes it the way the generator would — including on the band
 * the user last finished it on, not the lightest the library authors it for.
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

function Setup({ onReady }: { onReady: (db: ReturnType<typeof useStore>['db']) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

describe('Approval — Add exercise uses the remembered working band', () => {
  it('a band exercise the user last finished on B4 is added on B4', async () => {
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
      request: { focus: 'upper', difficulty: 'medium', targetMinutes: 30 },
      clock,
      rng: createRng(seedFromString('approval-add-band')),
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
    for (const e of exerciseLibrary.exercises) {
      if (e.equipment !== 'band') continue;
      exerciseStateRepo.recordExercisePerformed(
        db,
        e.id,
        { localDate: '2026-01-01', workingBand: 'B4' },
        utcInstant,
      );
    }

    render(
      <StoreProvider>
        <NavigationContainer>
          <ApprovalScreen
            navigation={{ navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() } as never}
            route={{ key: 'Approval', name: 'Approval', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('start-button')).toBeTruthy(), WAIT_OPTS);

    await fireEvent.press(screen.getByTestId('add-exercise-main'));
    await waitFor(() => expect(screen.getByTestId('add-picker-main')).toBeTruthy(), WAIT_OPTS);
    const bandOption = screen
      .getAllByTestId(/^add-option-/)
      .map((o) => (o.props.testID as string).replace('add-option-', ''))
      .find((id) => exerciseLibrary.exercises.find((e) => e.id === id)?.equipment === 'band');
    expect(bandOption).toBeDefined();
    await fireEvent.press(screen.getByTestId(`add-option-${bandOption}`));

    await waitFor(() => {
      const added = sessionsRepo
        .getSession(db, sessionId)!
        .entries.find((e) => e.exerciseId === bandOption && e.unplanned);
      expect(added?.band).toBe('B4');
    }, WAIT_OPTS);
  });
});
