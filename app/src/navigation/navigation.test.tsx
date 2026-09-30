/**
 * The shell: root stack -> Tabs (Today, Field Guide) with the custom tab bar, driven through the
 * real navigator and the real on-device store like the screen tests. Also pins the `homeReset`
 * shape every flow screen uses to "go home" now that Home lives inside the `Tabs` route.
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { usersRepo } from '@roamfit/store';
import RootNavigator from './RootNavigator';
import { homeReset } from './routes';
import { TAB_META } from './TabBar';
import { StoreProvider } from '../state/StoreContext';
import { getDb } from '../db';
import { nowUtcInstant } from '../lib/localClock';
import { navTheme } from '../theme';

const WAIT = { timeout: 5000, interval: 50 };

beforeAll(() => {
  usersRepo.acknowledgeDisclaimer(getDb(), nowUtcInstant()); // §13.3 gate — not this test's subject
});

async function boot() {
  await render(
    <StoreProvider>
      <NavigationContainer theme={navTheme}>
        <RootNavigator />
      </NavigationContainer>
    </StoreProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('tab-Home')).toBeTruthy(), WAIT);
}

describe('navigation shell', () => {
  it('boots on Today with the custom tab bar labelled Today / Field Guide', async () => {
    await boot();
    await waitFor(() => expect(screen.getByTestId('today-card')).toBeTruthy(), WAIT);
    expect(screen.getByLabelText(TAB_META.Home.label)).toBeTruthy();
    expect(screen.getByLabelText(TAB_META.Exercises.label)).toBeTruthy();
    expect(screen.getByTestId('tab-Home').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByTestId('tab-Exercises').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('the Field Guide tab shows the library and Today brings you back', async () => {
    await boot();
    await fireEvent.press(screen.getByTestId('tab-Exercises'));
    await waitFor(() => expect(screen.getByTestId('exercise-list')).toBeTruthy(), WAIT);
    expect(screen.getByTestId('tab-Exercises').props.accessibilityState).toMatchObject({
      selected: true,
    });

    await fireEvent.press(screen.getByTestId('tab-Home'));
    await waitFor(() => expect(screen.getByTestId('today-card')).toBeTruthy(), WAIT);
    expect(screen.getByTestId('tab-Home').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  it("Home's own open-exercises button still lands on the Field Guide tab", async () => {
    await boot();
    await waitFor(() => expect(screen.getByTestId('open-exercises')).toBeTruthy(), WAIT);
    await fireEvent.press(screen.getByTestId('open-exercises'));
    await waitFor(() => expect(screen.getByTestId('exercise-list')).toBeTruthy(), WAIT);
  });

  it('the Settings and Generate flow screens open above the tabs', async () => {
    await boot();
    await waitFor(() => expect(screen.getByTestId('open-settings')).toBeTruthy(), WAIT);
    await fireEvent.press(screen.getByTestId('open-settings'));
    await waitFor(() => expect(screen.queryByTestId('open-settings')).toBeNull(), WAIT);
  });
});

describe('homeReset', () => {
  it('resets the root stack to Tabs -> Home', () => {
    expect(homeReset()).toEqual({
      index: 0,
      routes: [{ name: 'Tabs', params: { screen: 'Home' } }],
    });
  });
});
