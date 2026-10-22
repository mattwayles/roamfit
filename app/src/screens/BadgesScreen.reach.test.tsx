/**
 * Track 44d - "Within reach today" in the locked badge sheet: the label and a one-tap way to set
 * the matching Generate setting up (its own file so the render environment starts clean).
 */
import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StoreProvider } from '../state/StoreContext';
import type { RootStackParamList } from '../navigation/types';
import BadgesScreen from './BadgesScreen';

const WAIT_OPTS: Parameters<typeof waitFor>[1] = { timeout: 5000, interval: 50 };
const Stack = createNativeStackNavigator<RootStackParamList>();

function FakeGenerate({ route }: { route: { params?: object } }) {
  return <Text testID="fake-generate">{JSON.stringify(route.params ?? {})}</Text>;
}

describe('BadgesScreen within reach', () => {
  it('offers a recovery week pre-fill from the locked badge sheet', async () => {
    render(
      <StoreProvider>
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Badges" component={BadgesScreen} />
            <Stack.Screen name="Generate" component={FakeGenerate as never} />
          </Stack.Navigator>
        </NavigationContainer>
      </StoreProvider>,
    );
    await waitFor(
      () => expect(screen.getByTestId('badge-recovery_week_1')).toBeTruthy(),
      WAIT_OPTS,
    );
    await fireEvent.press(screen.getByTestId('badge-recovery_week_1'));
    await waitFor(
      () => expect(screen.getByTestId('badges-reach-sheet-recovery_week_1')).toBeTruthy(),
      WAIT_OPTS,
    );
    expect(screen.getByTestId('badges-reach-sheet-recovery_week_1').props.children).toBe(
      'Within reach today',
    );
    await fireEvent.press(screen.getByTestId('badges-reach-action-sheet-recovery_week_1'));
    await waitFor(() => expect(screen.getByTestId('fake-generate')).toBeTruthy(), WAIT_OPTS);
    expect(JSON.parse(screen.getByTestId('fake-generate').props.children)).toEqual({
      recoveryWeek: true,
    });
  });
});
