/**
 * §10.3 — the redesigned approval entry card, from device feedback that the old single-row layout
 * was unusable: the exercise name was squeezed to a few characters, "reps−" rendered as "reps",
 * the sets buttons showed a bare "−"/"+" with no indication of what they changed, and
 * "too easy ▲" rendered as "too e". Timed exercises had no way to change their duration at all.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { generate, sessionsRepo } from '@roamfit/store';
import ApprovalScreen, { estimateMinutes } from './ApprovalScreen';
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

async function seed(db: ReturnType<typeof useStore>['db']): Promise<string> {
  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', effort: 'normal', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString('entry-card-seed')),
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

function renderApproval(sessionId: string) {
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
}

describe('§10.3 approval entry card', () => {
  it('labels every stepper and shows its current value', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);
    const sessionId = await seed(db);
    const entry = sessionsRepo
      .getSession(db, sessionId)!
      .entries.find((e) => e.section === 'main' && e.repTarget != null)!;

    renderApproval(sessionId);
    await waitFor(() => expect(screen.getByTestId('start-button')).toBeTruthy(), WAIT_OPTS);

    // The label lives beside the buttons, not inside them, so it can never be clipped.
    expect(screen.getAllByText('Sets').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Reps').length).toBeGreaterThan(0);
    // Buttons carry only the glyph, plus an accessible name saying what they do.
    expect(screen.getByTestId(`sets-plus-${entry.exerciseId}`)).toBeTruthy();
    expect(screen.getAllByLabelText('Increase sets').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Decrease reps').length).toBeGreaterThan(0);
    // Rest is a dial too, not a fixed consequence of the effort table.
    expect(screen.getAllByText('Rest').length).toBeGreaterThan(0);
    // Swap and Remove are both icon buttons; the meaning lives in the accessible name, since a
    // glyph cannot carry it and a clipped word is what this redesign existed to fix.
    expect(screen.getAllByLabelText(/^Swap .* for another exercise$/).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/^Remove /).length).toBeGreaterThan(0);

    // Swap must not look like the +/- buttons or like Remove: it is the only control on the card
    // that replaces the exercise, so it should not read as one that nudges a number.
    const bg = (testID: string): unknown =>
      StyleSheet.flatten(screen.getByTestId(testID).props.style)?.backgroundColor;
    const swapBg = bg(`swap-${entry.exerciseId}`);
    expect(swapBg).toBeDefined();
    expect(swapBg).not.toBe(bg(`sets-plus-${entry.exerciseId}`));
    expect(swapBg).not.toBe(bg(`remove-${entry.exerciseId}`));
  });

  it('a timed exercise gets a Time stepper that actually changes the duration', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);
    const sessionId = await seed(db);
    const timed = sessionsRepo
      .getSession(db, sessionId)!
      .entries.find((e) => e.durationSec != null)!;
    expect(timed).toBeTruthy();
    const before = timed.durationSec!;

    renderApproval(sessionId);
    await waitFor(
      () => expect(screen.getByTestId(`duration-plus-${timed.exerciseId}`)).toBeTruthy(),
      WAIT_OPTS,
    );
    expect(screen.getAllByText('Time').length).toBeGreaterThan(0);

    fireEvent.press(screen.getByTestId(`duration-plus-${timed.exerciseId}`));
    await waitFor(() => {
      const after = sessionsRepo.getSession(db, sessionId)!.entries.find((e) => e.id === timed.id)!;
      expect(after.durationSec).toBe(before + 5);
    }, WAIT_OPTS);

    fireEvent.press(screen.getByTestId(`duration-minus-${timed.exerciseId}`));
    await waitFor(() => {
      const after = sessionsRepo.getSession(db, sessionId)!.entries.find((e) => e.id === timed.id)!;
      expect(after.durationSec).toBe(before);
    }, WAIT_OPTS);

    // A timed entry must not also offer a Reps stepper.
    expect(screen.queryByTestId(`reps-plus-${timed.exerciseId}`)).toBeNull();
  });

  it('editing sets, reps or duration keeps estimatedSec — and so the estimate — honest', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);
    const sessionId = await seed(db);

    const reps = sessionsRepo
      .getSession(db, sessionId)!
      .entries.find((e) => e.section === 'main' && e.repTarget != null)!;
    const estimateBefore = estimateMinutes(sessionsRepo.getSession(db, sessionId)!);

    // Six more sets on one exercise has to move a whole-session minute estimate.
    for (let i = 0; i < 6; i++) {
      sessionsRepo.adjustSetsAtApproval(db, reps.id, reps.sets + i + 1, nowUtcInstant());
    }
    const after = sessionsRepo.getSession(db, sessionId)!;
    expect(after.entries.find((e) => e.id === reps.id)!.estimatedSec).toBeGreaterThan(
      reps.estimatedSec,
    );
    expect(estimateMinutes(after)).toBeGreaterThan(estimateBefore);
  });

  it('cards size to their content, and the drag uses the measured height not a constant', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);
    const sessionId = await seed(db);
    const mains = sessionsRepo
      .getSession(db, sessionId)!
      .entries.filter((e) => e.section === 'main');
    expect(mains.length).toBeGreaterThanOrEqual(2);

    renderApproval(sessionId);
    await waitFor(() => expect(screen.getByTestId('start-button')).toBeTruthy(), WAIT_OPTS);

    // No fixed height any more — a card is free to grow with a long exercise name.
    const card = screen.getByTestId(`entry-${mains[0].exerciseId}`);
    expect(StyleSheet.flatten(card.props.style)?.height).toBeUndefined();

    // Report a much taller first card than the estimate. The drag must then need MORE travel to
    // move past it — with a fixed pitch it would have swapped at the old constant regardless,
    // which is exactly the drift this change removes.
    const TALL = 400;
    await act(async () => {
      screen
        .getByTestId(`entry-${mains[0].exerciseId}`)
        .props.onLayout({ nativeEvent: { layout: { height: TALL } } });
    });

    const handle = screen.getByTestId(`drag-handle-${mains[1].exerciseId}`);
    const startY = 800;
    // A travel that WOULD have crossed a 132pt card, but is nowhere near half of a 400pt one.
    await act(async () => {
      handle.props.onResponderGrant({ nativeEvent: { pageY: startY } });
    });
    await act(async () => {
      handle.props.onResponderMove({ nativeEvent: { pageY: startY - 140 } });
    });
    await act(async () => {
      handle.props.onResponderRelease({ nativeEvent: { pageY: startY - 140 } });
    });

    const after = sessionsRepo
      .getSession(db, sessionId)!
      .entries.filter((e) => e.section === 'main');
    expect(after[0].id).toBe(mains[0].id); // unmoved: 140pt is not past the tall card's midpoint
  });

  it('no longer renders the up/down reorder buttons', async () => {
    let db!: ReturnType<typeof useStore>['db'];
    render(
      <StoreProvider>
        <Setup onReady={(d) => (db = d)} />
      </StoreProvider>,
    );
    await waitFor(() => expect(db).toBeDefined(), WAIT_OPTS);
    const sessionId = await seed(db);
    const entry = sessionsRepo.getSession(db, sessionId)!.entries[0];

    renderApproval(sessionId);
    await waitFor(() => expect(screen.getByTestId('start-button')).toBeTruthy(), WAIT_OPTS);

    expect(screen.queryByTestId(`move-up-${entry.exerciseId}`)).toBeNull();
    expect(screen.queryByTestId(`move-down-${entry.exerciseId}`)).toBeNull();
    expect(screen.getByTestId(`drag-handle-${entry.exerciseId}`)).toBeTruthy();
  });
});
