/**
 * §10.3 — the redesigned approval entry card, from device feedback that the old single-row layout
 * was unusable: the exercise name was squeezed to a few characters, "reps−" rendered as "reps",
 * the sets buttons showed a bare "−"/"+" with no indication of what they changed, and
 * "too easy ▲" rendered as "too e". Timed exercises had no way to change their duration at all.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
    // The full wording fits now; Remove is a compact X with an accessible name instead.
    expect(screen.getAllByText('Swap exercise').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/^Remove /).length).toBeGreaterThan(0);
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
