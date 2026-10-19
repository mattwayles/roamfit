/**
 * Track 37h — first-launch setup, through the real navigator and the real on-device store. This
 * file gets its own fresh db (see `app/src/db/index.ts`), so its first test really is a first
 * launch. Tests run in order and share that db: walkthrough, then review from Settings.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { progressionStateRepo, usersRepo } from '@roamfit/store';
import RootNavigator from '../navigation/RootNavigator';
import { StoreProvider } from '../state/StoreContext';
import { ThemeProvider } from '../state/ThemeProvider';
import { getDb } from '../db';
import { WAIT, ready } from '../ui/test-utils';

async function launch() {
  await render(
    <StoreProvider>
      <ThemeProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </ThemeProvider>
    </StoreProvider>,
  );
}

const checked = (testID: string) =>
  screen.getByTestId(testID).props.accessibilityState.checked as boolean;
const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));
const step = (id: string) => ready(`onboarding-step-${id}`);

describe('first-launch setup', () => {
  it('starts with the disclaimer, and a relaunch after it resumes setup instead of opening Today', async () => {
    await launch();
    await ready('disclaimer-gate');
    expect(screen.queryByTestId('tab-Journey')).toBeNull();
    await press('disclaimer-acknowledge');
    await step('goal');
    expect(screen.getByTestId('onboarding-progress')).toHaveTextContent('2 of 8');
    expect(usersRepo.getUser(getDb())!.onboardingInProgress).toBe(true);

    await screen.unmount();
    await launch();
    await step('goal');
    expect(screen.queryByTestId('disclaimer-gate')).toBeNull();
    expect(screen.queryByTestId('today-card')).toBeNull();
  });

  it('every step saves as it goes, placement moves the ladders, and the last step opens Today', async () => {
    await launch();
    await step('goal');
    expect(checked('pref-goal-general')).toBe(true);
    await press('pref-goal-muscle');
    await press('onboarding-next');

    await step('placement');
    await press('placement-experience-regular');
    await press('placement-push_ups-many');
    await press('onboarding-next');

    await step('equipment');
    expect(checked('onboarding-anchor-anchor-mid')).toBe(false); // nothing is assumed (37b)
    expect(checked('onboarding-bands')).toBe(false);
    // A band anchor point means nothing without a band: locked until Resistance bands is ticked.
    expect(
      screen.getByTestId('onboarding-anchor-anchor-mid').props.accessibilityState.disabled,
    ).toBe(true);
    expect(
      screen.getByTestId('onboarding-anchor-pullup-bar').props.accessibilityState.disabled,
    ).toBe(false);
    await press('onboarding-bands');
    expect(checked('onboarding-bands')).toBe(true);
    await press('onboarding-anchor-anchor-mid');
    await press('onboarding-next');

    await step('bands');
    await press('band-owned-B1');
    await press('toggle-band-stacking');
    await press('onboarding-next');

    await step('limitations');
    await press('limitation-knee');
    await press('onboarding-next');

    await step('days');
    await press('pref-days-plus');
    await press('onboarding-back');
    await step('limitations');
    expect(checked('limitation-knee')).toBe(true);
    await press('onboarding-next');
    await step('days');
    await press('onboarding-next');

    await step('safety');
    expect(screen.getByTestId('anchor-safety-guide')).toBeTruthy();
    expect(screen.queryByTestId('onboarding-skip')).toBeNull();
    await press('onboarding-next');

    await ready('today-card');
    await waitFor(() => expect(screen.getByTestId('tab-Journey')).toBeTruthy(), WAIT);
    const user = usersRepo.getUser(getDb())!;
    expect(user.onboardingInProgress).toBe(false);
    expect(user.trainingPreferences.goal).toBe('muscle');
    expect(user.anchorsAvailable).toEqual(['anchor-mid']);
    expect(user.limitationChoices.map((c) => c.id)).toEqual(['knee']);
    expect(user.weeklyTarget).toBe(4);
    expect(user.bandSettings).toEqual({ owned: ['B2', 'B3', 'B4', 'B5'], stacking: true });
    expect(progressionStateRepo.getAllProgressionStates(getDb()).horizontal_push.levelId).toBe(
      'horizontal_push.l6',
    );
  });

  it('Settings > Run setup again starts at the goal, prefilled, and leaves the ladders alone unless answered', async () => {
    const before = progressionStateRepo.getAllProgressionStates(getDb());
    await launch();
    await ready('open-settings');
    await press('open-settings');
    await ready('settings-run-setup');
    await press('settings-run-setup');
    await step('goal');
    expect(screen.getByTestId('onboarding-progress')).toHaveTextContent('1 of 7');
    expect(checked('pref-goal-muscle')).toBe(true);
    await press('onboarding-next');
    await step('placement');
    expect(screen.getByTestId('placement-review-note')).toBeTruthy();
    await press('onboarding-next');
    await step('equipment');
    expect(checked('onboarding-anchor-anchor-mid')).toBe(true);
    await press('onboarding-next');
    await step('bands');
    expect(checked('band-owned-B1')).toBe(false);
    await press('onboarding-skip'); // "Close"
    await ready('settings-screen');
    expect(progressionStateRepo.getAllProgressionStates(getDb())).toEqual(before);
  });
});
