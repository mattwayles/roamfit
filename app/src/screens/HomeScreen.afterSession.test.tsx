/**
 * The "just completed a session" state — per the wave brief's testing note ("test the
 * zero-session and just-completed-a-session states, not just the happy middle"). Complements
 * `HomeScreen.dashboard.test.tsx` (zero-session). Drives the real store (generate -> start ->
 * logSet -> completeSession) directly rather than through the full Workout UI — this test's job
 * is Today's rendering of the result, not re-proving the workout loop (already covered elsewhere).
 * Lifetime counters, muscle balance and the calendar now live on Journey (see
 * `JourneyScreen.afterSession.test.tsx`).
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { render, screen, waitFor, within } from '@testing-library/react-native';
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
    request: { focus: 'full', difficulty: 'hard', targetMinutes: 30 },
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

describe('Today after a completed session', () => {
  it("marks today's trained day in the week strip, with no counts of what didn't happen", async () => {
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

    // The strip carries today's trained marker (a 'full' session -> the full-body label), and
    // is the only calendar Today shows; totals and the month grid belong to Journey.
    const today = nowEngineClock().today;
    const strip = screen.getByTestId('week-strip');
    const cell = within(strip).getByTestId(`week-day-${today}`);
    expect(cell.props.accessibilityLabel).toBe('Full-body workout — open Journey');
    expect(screen.queryByTestId('lifetime-counters')).toBeNull();
    expect(screen.queryByTestId('calendar-heatmap')).toBeNull();
    expect(screen.queryByTestId('muscle-balance')).toBeNull();

    // Next Unlock still points somewhere concrete.
    expect(screen.getByTestId('next-unlock-hero')).toBeTruthy();
  });
});
