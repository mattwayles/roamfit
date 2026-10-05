/**
 * §14.2 zero-session Journey — the state the orchestrator said it would verify independently
 * ("mount it with a completely empty database and confirm it is meaningful, not empty"). This
 * file gets its own fresh on-device db (unique filename per Jest test file, see
 * `app/src/db/index.ts`'s worker/file-scoped naming) so there is no risk of a prior test's
 * session leaking in — this really is a from-scratch install.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { familyLibrary } from '@roamfit/data';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider } from '../state/StoreContext';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };

describe('§14.2 cold start — Journey is never empty', () => {
  it('renders every trail at starting level, the first-session note and encouraging empty states — with zero sessions ever run', async () => {
    render(
      <StoreProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </StoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('disclaimer-gate')).toBeTruthy(), WAIT_OPTS);
    fireEvent.press(screen.getByTestId('disclaimer-acknowledge'));
    await waitFor(() => expect(screen.getByTestId('today-card')).toBeTruthy(), WAIT_OPTS);

    await fireEvent.press(screen.getByTestId('tab-Journey'));
    await waitFor(() => expect(screen.getByTestId('journey-screen')).toBeTruthy(), WAIT_OPTS);

    // First-session explanation, shown because lifetimeSessionCount is 0.
    expect(screen.getByTestId('first-session-explanation')).toBeTruthy();

    // The full progression board — every family in the content library, none of them at the
    // summit (a fresh install starts at level 1, nowhere near a ladder's top).
    for (const family of familyLibrary.families) {
      expect(screen.getByTestId(`board-row-${family.id}`)).toBeTruthy();
    }
    expect(screen.queryAllByText('Summit').length).toBe(0);
    // No trail has a session yet, so no card draws a best-set chart, and there is no Progress
    // button: the chart lives on the card itself.
    expect(screen.queryAllByTestId(/^board-chart-plot-/)).toHaveLength(0);
    expect(screen.queryAllByTestId(/^board-trail-progress-/)).toHaveLength(0);

    // The sections that need a first session say what will land there instead of going blank —
    // and none of them shows a zero count.
    expect(screen.getByTestId('journey-empty')).toBeTruthy();
    expect(screen.getByTestId('logbook-empty')).toBeTruthy();
    expect(screen.getByTestId('passport-empty')).toBeTruthy();
    expect(screen.queryByTestId('lifetime-counters')).toBeNull();
    expect(screen.queryByTestId('calendar-heatmap')).toBeNull();
    expect(screen.queryByTestId('passport-opt-in')).toBeNull();
  });
});
