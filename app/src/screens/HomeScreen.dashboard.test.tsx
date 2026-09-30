/**
 * §14.2 zero-session Today — the state the orchestrator said it would verify independently
 * ("mount it with a completely empty database and confirm it is meaningful, not empty"). This
 * file gets its own fresh on-device db (unique filename per Jest test file, see
 * `app/src/db/index.ts`'s worker/file-scoped naming) so there is no risk of a prior test's
 * session leaking in — this really is a from-scratch install. The Trails half of the zero-session
 * guarantee lives in `JourneyScreen.dashboard.test.tsx`.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider } from '../state/StoreContext';
import { greetingFor } from '../lib/hypeCopy';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

describe('§14.2 cold start — Today is never empty', () => {
  it('gates on the disclaimer (with no tab bar to escape through), then shows the hero, tiles, week strip and a real Next Unlock — with zero sessions ever run', async () => {
    render(
      <StoreProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </StoreProvider>,
    );

    // §13.3 — a truly from-scratch install shows the blocking first-launch disclaimer before
    // anything else, and takes the tab bar away so no other tab is reachable behind it.
    await waitFor(() => expect(screen.getByTestId('disclaimer-gate')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('disclaimer-gate-text')).toBeTruthy();
    expect(screen.queryByTestId('tab-Journey')).toBeNull();
    expect(screen.queryByTestId('tab-Exercises')).toBeNull();
    expect(screen.queryByTestId('today-card')).toBeNull();

    // Dismiss it exactly the way a real user would (a real tap) — this is also the one test in
    // this suite honest enough to exercise that gate.
    fireEvent.press(screen.getByTestId('disclaimer-acknowledge'));

    // Today card, not a resume card — nothing has ever been generated. Tabs are back.
    await waitFor(() => expect(screen.getByTestId('today-card')).toBeTruthy(), WAIT_OPTS);
    expect(screen.queryByTestId('resume-card')).toBeNull();
    expect(screen.queryByTestId('disclaimer-gate')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('tab-Journey')).toBeTruthy(), WAIT_OPTS);

    // Wordmark greeting and the Settings gear.
    expect(screen.getByTestId('today-greeting').props.children).toBe(greetingFor(new Date()));
    expect(screen.getByTestId('open-settings')).toBeTruthy();

    // Quick Session + In transit tiles are live from the first launch.
    expect(screen.getByTestId('quick-session-button')).toBeTruthy();
    expect(screen.getByTestId('travel-day-button')).toBeTruthy();

    // Next Unlock — a concrete, non-empty "why open tomorrow" card, not a placeholder.
    expect(screen.getByTestId('next-unlock-hero')).toBeTruthy();
    expect(screen.getByTestId('next-unlock-ring')).toBeTruthy();

    // The week strip shows neutral cells, never a tally.
    // Always seven real days, even at a month edge (the neighbouring month's days are real cells).
    expect(within(screen.getByTestId('week-strip')).getAllByTestId(/^week-day-/)).toHaveLength(7);
    expect(screen.queryByText(/this week/i, { exact: false })).not.toBeNull(); // the section label
    expect(screen.queryByText(/^0\b/)).toBeNull();
  });
});
