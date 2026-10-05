/**
 * §5.6 "Your route" presentation, through the real ApprovalScreen and store: the boarding-pass
 * header (live MIN estimate, LEVEL, MOVES), the section-colored route timeline, the add sheet, the
 * sticky footer's Regenerate / LET'S GO, and the keyboard "Done" accessory on the numeric fields.
 * Behavior (mutations, reorder, abandon) is covered by the other ApprovalScreen tests.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo } from '@roamfit/store';
import ApprovalScreen, { estimateMinutes } from './ApprovalScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';
import { midnightTheme } from '../theme';

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
    <StoreProvider>
      <NavigationContainer>
        <ApprovalScreen
          navigation={navigation as never}
          route={{ key: 'k', name: 'Approval', params: { sessionId } } as never}
        />
      </NavigationContainer>
    </StoreProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('start-button')).toBeTruthy(), WAIT_OPTS);
  return { db, sessionId, navigation };
}

describe('§5.6 Plan / Approval presentation', () => {
  it('the boarding pass shows focus, the live minute estimate, level and move count', async () => {
    const { db, sessionId } = await mount();
    const session = sessionsRepo.getSession(db, sessionId)!;
    const active = session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');

    expect(screen.getByTestId('boarding-pass')).toBeTruthy();
    expect(screen.getByTestId('plan-focus').props.children).toBe('Legs');
    expect(screen.getByTestId('plan-minutes').props.children).toBe(estimateMinutes(session));
    expect(screen.getByTestId('plan-level').props.children).toBe('Hard');
    expect(screen.getByTestId('plan-moves').props.children).toBe(active.length);
    // The §5.8 explanation sits under the perforation.
    expect(screen.getByText(session.explanation)).toBeTruthy();

    // Removing a move updates MOVES (and MIN) live.
    const first = active[0];
    await fireEvent.press(screen.getByTestId(`remove-${first.exerciseId}`));
    await waitFor(
      () => expect(screen.getByTestId('plan-moves').props.children).toBe(active.length - 1),
      WAIT_OPTS,
    );
  });

  it('each section has a chip in its own color and a card node on its rail', async () => {
    await mount();
    for (const section of ['warmup', 'main', 'cooldown']) {
      expect(screen.getByTestId(`section-${section}`)).toBeTruthy();
    }
    expect(screen.getByText('Warm-up')).toBeTruthy();
    expect(screen.getByText('Main')).toBeTruthy();
    expect(screen.getByText('Cool-down')).toBeTruthy();
    expect(screen.getAllByLabelText(/^Add exercise to /)).toHaveLength(3);
  });

  it('numeric fields share a keyboard Done accessory', async () => {
    const { db, sessionId } = await mount();
    const entry = sessionsRepo
      .getSession(db, sessionId)!
      .entries.find((e) => e.section === 'main' && e.repTarget != null)!;
    const field = screen.getByTestId(`reps-input-${entry.exerciseId}`);
    expect(field.props.inputAccessoryViewID).toBeTruthy();
    expect(field.props.keyboardType).toBe('number-pad');
    expect(screen.getByTestId('approval-keyboard-done')).toBeTruthy();
  });

  it('swap wears its own tint, and its notice is a coral pill', async () => {
    const { db, sessionId } = await mount();
    const entry = sessionsRepo
      .getSession(db, sessionId)!
      .entries.find((e) => e.section === 'main' && e.progressionFamilyId)!;
    const bg = StyleSheet.flatten(screen.getByTestId(`swap-${entry.exerciseId}`).props.style);
    expect(bg?.backgroundColor).toBe(midnightTheme.tints.coral);

    await fireEvent.press(screen.getByTestId(`swap-${entry.exerciseId}`));
    await waitFor(() => expect(screen.getByTestId('swap-notice')).toBeTruthy(), WAIT_OPTS);
    expect(StyleSheet.flatten(screen.getByTestId('swap-notice').props.style)?.backgroundColor).toBe(
      midnightTheme.tints.coral,
    );
  });

  it('the add sheet can be cancelled without adding anything', async () => {
    const { db, sessionId } = await mount();
    const before = sessionsRepo.getSession(db, sessionId)!.entries.length;

    await fireEvent.press(screen.getByTestId('add-exercise-warmup'));
    await waitFor(() => expect(screen.getByTestId('add-picker-warmup')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getAllByTestId(/^add-option-/).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId('add-cancel-warmup'));
    await waitFor(() => expect(screen.queryByTestId('add-picker-warmup')).toBeNull(), WAIT_OPTS);
    expect(sessionsRepo.getSession(db, sessionId)!.entries.length).toBe(before);
  });

  it("the footer regenerates into a fresh plan, and LET'S GO starts this one", async () => {
    const { sessionId, navigation } = await mount();
    expect(screen.getByLabelText('Regenerate plan')).toBeTruthy();
    expect(screen.getByText("Let's go")).toBeTruthy();

    await fireEvent.press(screen.getByTestId('regenerate-button'));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalled(), WAIT_OPTS);
    const [route, params] = navigation.replace.mock.calls[0] as [string, { sessionId: string }];
    expect(route).toBe('Approval');
    expect(params.sessionId).not.toBe(sessionId);
  });
});
