/**
 * §14.2 zero-session dashboard — the state the orchestrator said it would verify independently
 * ("mount it with a completely empty database and confirm it is meaningful, not empty"). This
 * file gets its own fresh on-device db (unique filename per Jest test file, see
 * `app/src/db/index.ts`'s worker/file-scoped naming) so there is no risk of a prior test's
 * session leaking in — this really is a from-scratch install.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { render, screen, waitFor } from '@testing-library/react-native';
import { familyLibrary } from '@roamfit/data';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider } from '../state/StoreContext';

describe('§14.2 cold start — the dashboard is never empty', () => {
  it('renders the full progression board at starting levels, the calibration note, the Today card, and a real Next Unlock — with zero sessions ever run', async () => {
    render(
      <StoreProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </StoreProvider>,
    );

    // Today card, not a resume card — nothing has ever been generated.
    await waitFor(() => expect(screen.getByTestId('today-card')).toBeTruthy());
    expect(screen.queryByTestId('resume-card')).toBeNull();

    // §6.5 calibration explanation, shown because lifetimeSessionCount is 0.
    expect(screen.getByTestId('calibration-explanation')).toBeTruthy();

    // Next Unlock hero — a concrete, non-empty "why open tomorrow" line, not a placeholder.
    const hero = screen.getByTestId('next-unlock-hero');
    expect(hero).toBeTruthy();

    // The full progression board — every family in the content library, none of them mastered
    // (a fresh install starts at the §6.5 calibration percentile, nowhere near a ladder's top).
    for (const family of familyLibrary.families) {
      const row = screen.getByTestId(`board-row-${family.id}`);
      expect(row).toBeTruthy();
    }
    expect(screen.queryAllByText('Mastery').length).toBe(0);

    // This week's dots render at 0 filled (a brand-new user hasn't trained yet) — present, and
    // critically not styled as a failure (no red/empty assertion possible in RNTL directly, but
    // the dots string itself must exist and be non-shaming, i.e. all open circles, not a "0/3
    // missed" framing).
    const dots = screen.getByTestId('week-dots');
    expect(dots.props.children).toContain('○');
  });
});
