/**
 * The "just completed a session" state — per the wave brief's testing note ("test the
 * zero-session and just-completed-a-session states, not just the happy middle"). Complements
 * `HomeScreen.dashboard.test.tsx` (zero-session). Drives the real store (generate -> start ->
 * logSet -> completeSession) directly rather than through the full Workout UI — this test's job
 * is Home's rendering of the result, not re-proving the workout loop (already covered elsewhere).
 */
import React from 'react';
import { Share } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { exerciseLibrary, familyLibrary } from '@roamfit/data';
import { completeSession, generate, sessionsRepo, usersRepo } from '@roamfit/store';
import { createRng, seedFromString } from '@roamfit/engine';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider, useStore } from '../state/StoreContext';
import { nowEngineClock, nowUtcInstant } from '../lib/localClock';

function CompleteOneSession({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { db } = useStore();
  usersRepo.acknowledgeDisclaimer(db, new Date().toISOString()); // §13.3 gate — not this test's job
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, nowUtcInstant());

  const clock = nowEngineClock();
  const utcInstant = nowUtcInstant();
  const { plan, comebackTier, recoveryWeekManual } = generate(db, {
    library: exerciseLibrary,
    families: familyLibrary,
    request: { focus: 'full', effort: 'hard', targetMinutes: 30 },
    clock,
    rng: createRng(seedFromString('after-session-test')),
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
  sessionsRepo.startSession(db, sessionId, utcInstant);
  const session = sessionsRepo.getSession(db, sessionId)!;
  for (const entry of session.entries) {
    if (entry.entryStatus === 'removed_at_approval') continue;
    for (let i = 0; i < entry.sets; i += 1) {
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
        utcInstant,
      );
    }
  }
  completeSession(
    db,
    { sessionId, library: exerciseLibrary, families: familyLibrary },
    nowUtcInstant(),
  );

  return <>{children}</>;
}

describe('Home after a completed session', () => {
  it('shows lifetime counters, muscle balance, and the calendar heatmap once there is data', async () => {
    render(
      <StoreProvider>
        <CompleteOneSession>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </CompleteOneSession>
      </StoreProvider>,
    );

    // Explicit timeout: RNTL's default is 1000ms, and this screen's first render does real
    // migrations + generation against a real sqlite file — comfortably over a second on a
    // loaded machine. The bare default made this the suite's flakiest assertion.
    await waitFor(() => expect(screen.getByTestId('today-card')).toBeTruthy(), {
      timeout: 5000,
      interval: 50,
    });

    expect(screen.getByTestId('lifetime-counters')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy(); // Sessions counter
    expect(screen.getByTestId('muscle-balance')).toBeTruthy();
    expect(screen.getByTestId('calendar-heatmap')).toBeTruthy();

    // The zero-session calibration note must be gone now that a session exists.
    expect(screen.queryByTestId('calibration-explanation')).toBeNull();

    // §9.10 — the weekly summary share is a real (mocked) Share.share call, not a no-op button.
    const shareSpy = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction' } as never);
    await fireEvent.press(screen.getByTestId('share-weekly-summary'));
    expect(shareSpy).toHaveBeenCalledTimes(1);
    expect(shareSpy.mock.calls[0][0]).toHaveProperty('message');
    shareSpy.mockRestore();
  });
});
