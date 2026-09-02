/**
 * ADR 0009's paste-a-link field is the last thing on the Workout screen, so the software keyboard
 * opens straight over it and over its Save button (real device report). The screen's ScrollView
 * has to make room to scroll past the keyboard, let a tap reach Save while the keyboard is up,
 * and put the demo block at the top of what is left visible when the field takes focus.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo } from '@roamfit/store';
import WorkoutScreen from './WorkoutScreen';
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

describe('Workout screen keyboard handling', () => {
  it('scrolls past the keyboard and keeps taps live while it is up', async () => {
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
      rng: createRng(seedFromString('keyboard-inset-seed')),
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

    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={mockNavigation() as never}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('workout-elapsed')).toBeTruthy(), WAIT_OPTS);

    const scroll = screen.getByTestId('workout-scroll');
    // Room to scroll the content clear of the keyboard...
    expect(scroll.props.automaticallyAdjustKeyboardInsets).toBe(true);
    // ...and a tap on Save while the keyboard is up presses Save, rather than being spent
    // dismissing the keyboard and needing a second tap.
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  }, 20000);
});
