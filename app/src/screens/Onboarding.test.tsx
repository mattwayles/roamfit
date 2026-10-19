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
    expect(screen.getByTestId('welcome-logo')).toBeTruthy();
    expect(screen.queryByTestId('tab-Journey')).toBeNull();
    await press('disclaimer-acknowledge');
    await step('goal');
    expect(screen.getByTestId('onboarding-progress')).toHaveTextContent('2 of 3');
    expect(usersRepo.getUser(getDb())!.onboardingInProgress).toBe(true);

    await screen.unmount();
    await launch();
    await step('goal');
    expect(screen.queryByTestId('disclaimer-gate')).toBeNull();
    expect(screen.queryByTestId('today-card')).toBeNull();
  });

  it('every step saves as it goes, every trail starts at its first rung, and the last step opens Today', async () => {
    await launch();
    await step('goal');
    expect(checked('pref-goal-general')).toBe(true);
    await press('pref-goal-muscle');
    await press('onboarding-next');

    await step('limitations');
    await press('limitation-knee');
    expect(screen.queryByTestId('onboarding-skip')).toBeNull();
    await press('onboarding-back');
    await step('goal');
    expect(checked('pref-goal-muscle')).toBe(true);
    await press('onboarding-next');
    await step('limitations');
    expect(checked('limitation-knee')).toBe(true);
    await press('onboarding-next');

    await ready('today-card');
    await waitFor(() => expect(screen.getByTestId('tab-Journey')).toBeTruthy(), WAIT);
    const user = usersRepo.getUser(getDb())!;
    expect(user.onboardingInProgress).toBe(false);
    expect(user.trainingPreferences.goal).toBe('muscle');
    expect(user.limitationChoices.map((c) => c.id)).toEqual(['knee']);
    // Equipment and bands are not asked here: nothing is assumed until Generate.
    expect(user.anchorsAvailable).toEqual([]);
    expect(user.bandSettings).toEqual({ owned: [], stacking: false });
    expect(progressionStateRepo.getAllProgressionStates(getDb()).horizontal_push.levelId).toBe(
      'horizontal_push.l1',
    );
  });

  it('Settings > Run setup again starts at the goal, prefilled, and Close returns to Settings', async () => {
    await launch();
    await ready('open-settings');
    await press('open-settings');
    await ready('settings-run-setup');
    await press('settings-run-setup');
    await step('goal');
    expect(screen.getByTestId('onboarding-progress')).toHaveTextContent('1 of 2');
    expect(checked('pref-goal-muscle')).toBe(true);
    await press('onboarding-skip'); // "Close"
    await ready('settings-screen');
  });
});
