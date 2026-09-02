/**
 * A real @testing-library/react-native interaction test — the payoff for retrying carried-forward
 * issue #6 (docs/ORCHESTRATION.md): Wave 1 fell back to `react-test-renderer` because RNTL's
 * `render()` came back empty; this wave found that was simply a missed `await` (RNTL v14's
 * `render()` is async), not a real incompatibility. This test uses `render`/`screen`/`fireEvent`
 * for real queries, driving the full navigator + the actual `app/src/db` op-sqlite driver
 * underneath (nothing mocked) — Home's Quick Session button really does create and start a
 * session in the store, and this asserts the app actually navigates into the Workout screen for
 * it, which is the wave's headline "generate -> approve -> run" loop working end to end.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider, useStore } from '../state/StoreContext';
import { sessionsRepo, usersRepo } from '@roamfit/store';

/** Clears any pending session left over from a previous run against the same on-device db file
 *  (the singleton `getDb()` in app/src/db persists across test runs unless reset), so this test
 *  is idempotent regardless of prior state. Also pre-acknowledges §13.3's first-launch disclaimer
 *  gate — this test's job is the Quick Session flow, not re-proving the gate (covered in
 *  `HomeScreen.dashboard.test.tsx`). */
function Cleanup({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { db } = useStore();
  usersRepo.acknowledgeDisclaimer(db, new Date().toISOString());
  const pending = sessionsRepo.getPendingSession(db);
  if (pending) sessionsRepo.discardSession(db, pending.id, {}, new Date().toISOString());
  return <>{children}</>;
}

describe('Home -> Quick Session -> Workout', () => {
  it('shows the Today card with no pending session, and Quick Session lands on a real active workout', async () => {
    render(
      <StoreProvider>
        <Cleanup>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </Cleanup>
      </StoreProvider>,
    );

    // Explicit timeout: RNTL's default is 1000ms, and this screen's first render does real
    // migrations + generation against a real sqlite file — comfortably over a second on a
    // loaded machine. The bare default made this the suite's flakiest assertion.
    await waitFor(() => expect(screen.getByTestId('today-card')).toBeTruthy(), {
      timeout: 5000,
      interval: 50,
    });
    expect(screen.queryByTestId('resume-card')).toBeNull();

    await fireEvent.press(screen.getByTestId('quick-session-button'));

    // Navigated into the Workout screen for a genuinely-created, genuinely-started session —
    // either the reps hero or the timed circle renders, proving the whole
    // generate -> createPendingSession -> startSession -> render chain actually ran.
    await waitFor(
      () =>
        expect(
          screen.queryByTestId('complete-set') ?? screen.queryByTestId('timed-circle'),
        ).toBeTruthy(),
      { timeout: 5000 },
    );
  });
});
