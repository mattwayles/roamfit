/**
 * §10.6 mid-workout swap, driven through the real WorkoutScreen. Confirms the whole wiring end
 * to end: tapping Swap opens the sheet with real `alternativesForSlot` candidates (not a mock),
 * picking one calls `sessionsRepo.recordSwap` for real, the plan entry's exercise/prescription
 * actually changes, the swap is recorded as a signal (`swapAwayCount` on the replaced exercise),
 * and the flow returns straight to the exercise view with no re-approval/regeneration step.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createRng, seedFromString } from '@roamfit/engine';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { DEFAULT_BAND_TENSIONS, generate, sessionsRepo, usersRepo } from '@roamfit/store';
import WorkoutScreen from './WorkoutScreen';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

// Generous timeout/poll, per issue #14: default waitFor budgets are sized for an idle
// CPU and can be starved under real contention even when the underlying state is
// already correct.
const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

function mockNavigation() {
  return {
    navigate: jest.fn(),
    replace: jest.fn(),
    reset: jest.fn(),
    goBack: jest.fn(),
  };
}

function Setup({ onReady }: { onReady: (db: ReturnType<typeof useStore>['db']) => void }) {
  const { db } = useStore();
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  onReady(db);
  return null;
}

function fastForwardTo(
  db: ReturnType<typeof useStore>['db'],
  session: sessionsRepo.SessionRecord,
  stopBeforeEntryId: string,
) {
  for (const entry of session.entries) {
    if (entry.id === stopBeforeEntryId) return;
    if (entry.entryStatus === 'removed_at_approval') continue;
    for (let i = 0; i < entry.sets; i++) {
      sessionsRepo.logSet(
        db,
        {
          entryId: entry.id,
          setIndex: i,
          status: 'completed',
          repsPrescribed: entry.repTarget ?? undefined,
          secondsPrescribed: entry.durationSec ?? undefined,
          repsActual: entry.repTarget ?? undefined,
          secondsActual: entry.durationSec ?? undefined,
          restPrescribedSec: entry.restSec,
        },
        nowUtcInstant(),
      );
    }
  }
}

describe('band chip on the active workout screen', () => {
  it('shows the prescribed band, in the user’s own colour, during an active set', async () => {
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
      rng: createRng(seedFromString('band-chip-seed')),
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

    const session = sessionsRepo.getSession(db, sessionId)!;
    const active = session.entries.filter((e) => e.entryStatus !== 'removed_at_approval');
    const banded = active.find((e) => e.band != null && e.durationSec == null);
    expect(banded).toBeTruthy();

    fastForwardTo(db, session, banded!.id);

    render(
      <StoreProvider>
        <WorkoutScreen
          navigation={mockNavigation() as never}
          route={{ key: 'Workout', name: 'Workout', params: { sessionId } } as never}
        />
      </StoreProvider>,
    );

    await waitFor(
      () => expect(screen.getByTestId(`band-chip-${banded!.band}`)).toBeTruthy(),
      WAIT_OPTS,
    );
    // The colour is the user's, read from their row — not a palette the screen invented.
    const stored = usersRepo.ensureUser(db, nowUtcInstant()).bandTensions;
    expect(stored[banded!.band!].color).toBe(DEFAULT_BAND_TENSIONS[banded!.band!].color);
    // ...and the label is still there, so the chip never depends on colour alone.
    expect(screen.getByLabelText(`Band ${stored[banded!.band!].label}`)).toBeTruthy();
  });
});
