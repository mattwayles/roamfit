/** Plan / Approval under the Daybreak theme: paper cards, deep rails, light keyboard. */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo } from '@roamfit/store';
import ApprovalScreen from './ApprovalScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import { daybreak, daybreakTheme } from '../theme';
import { inDaybreak } from '../ui/test-utils';

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

async function seed(db: ReturnType<typeof useStore>['db']): Promise<string> {
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'legs', difficulty: 'hard', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString('approval-presentation-seed')),
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

async function mount() {
  let db!: ReturnType<typeof useStore>['db'];
  render(
    <StoreProvider>
      <Setup onReady={(d) => (db = d)} />
    </StoreProvider>,
  );
  await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);
  const sessionId = await seed(db);
  const navigation = mockNavigation();
  render(
    inDaybreak(
      <StoreProvider>
        <NavigationContainer>
          <ApprovalScreen
            navigation={navigation as never}
            route={{ key: 'k', name: 'Approval', params: { sessionId } } as never}
          />
        </NavigationContainer>
      </StoreProvider>,
    ),
  );
  await waitFor(() => expect(screen.getByTestId('start-button')).toBeTruthy(), WAIT_OPTS);
  return { db, sessionId, navigation };
}

describe('Plan / Approval in Daybreak', () => {
  it('paints the pass and cards on paper, rails in deep accents, and the keyboard light', async () => {
    const { db, sessionId } = await mount();
    const session = sessionsRepo.getSession(db, sessionId)!;
    const first = session.entries.find((e) => e.entryStatus !== 'removed_at_approval')!;

    const pass = StyleSheet.flatten(screen.getByTestId('boarding-pass').props.style);
    expect(pass.backgroundColor).toBe(daybreak.surface);
    expect(pass.borderColor).toBe(daybreak.line);
    expect(StyleSheet.flatten(screen.getByTestId('plan-minutes').props.style).color).toBe(
      daybreak.teal,
    );

    const card = StyleSheet.flatten(screen.getByTestId(`entry-${first.exerciseId}`).props.style);
    expect(card.backgroundColor).toBe(daybreak.surface);

    const input = screen.getByTestId(`sets-input-${first.exerciseId}`);
    expect(input.props.keyboardAppearance).toBe('light');
    expect(input.props.selectionColor).toBe(daybreak.teal);
    expect(StyleSheet.flatten(input.props.style).color).toBe(daybreak.text);
    expect(daybreakTheme.scheme).toBe('light');
  });
});
